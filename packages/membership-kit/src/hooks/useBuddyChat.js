import { useState, useCallback, useRef, useEffect } from 'react';
import { cam } from '../services/buddyApi';
import { CamClient } from '@cogability/sdk';

/**
 * Manages the chat lifecycle (anonymous or authenticated):
 *   1. Check for cam_token in sessionStorage (set by AuthProvider on login)
 *   2. Establish session: authenticated if cam_token exists, else anonymous
 *   3. Initialize cogbot (init config + greeting)
 *   4. Send/receive messages (JSON or SSE streaming) using the appropriate auth mode
 *
 * Returns { messages, isLoading, isInitializing, error, sendMessage, retry, streamingText }.
 */
export default function useBuddyChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const initRef = useRef(false);
  const streamingRef = useRef(false);
  const abortRef = useRef(null);
  const rafIdRef = useRef(null);
  const anonymousRef = useRef(true);

  const initialize = useCallback(async () => {
    try {
      setIsInitializing(true);
      setError(null);

      const idToken = sessionStorage.getItem('cam_token');
      if (idToken) {
        await cam.initAuthenticated(idToken);
        anonymousRef.current = false;
      } else {
        await cam.initAnonymous();
        anonymousRef.current = true;
      }

      const initData = await cam.initCogbot();
      streamingRef.current = initData?.config?.streaming === true;

      try {
        const greetingData = await cam.fetchGreeting();
        const greetings = (greetingData.output || [])
          .filter((g) => g.response_type === 'text' && g.text)
          .map((g) => ({ role: 'assistant', content: g.text, id: crypto.randomUUID() }));
        if (greetings.length > 0) setMessages(greetings);
      } catch (greetErr) {
        console.warn('BuddyChat: greeting fetch failed, chat still usable', greetErr);
      }
    } catch (err) {
      console.error('BuddyChat: init failed', err);
      setError('Unable to connect to Buddy. Please try again.');
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    initialize();
    return () => {
      abortRef.current?.abort();
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [initialize]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isLoading) return;

    const userMsg = { role: 'user', content: text.trim(), id: crypto.randomUUID() };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);
    setStreamingText('');

    if (streamingRef.current) {
      const controller = new AbortController();
      abortRef.current = controller;
      let pendingText = '';

      const schedulePartialUpdate = (newText) => {
        pendingText = newText;
        if (rafIdRef.current == null) {
          rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            setStreamingText(pendingText);
          });
        }
      };

      try {
        for await (const { eventName, data } of cam.streamMessage(text.trim(), {
          signal: controller.signal,
          anonymous: anonymousRef.current,
        })) {
          if (eventName === 'partial_object' || eventName === 'object_ready') {
            const generics = data?.output?.generic;
            if (Array.isArray(generics)) {
              const textParts = generics
                .filter((g) => g.response_type === 'text' && g.text)
                .map((g) => g.text);
              if (textParts.length > 0) schedulePartialUpdate(textParts.join('\n\n'));
            }
          } else if (eventName === 'final_response') {
            if (rafIdRef.current != null) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
            setStreamingText('');

            const generics = CamClient.parseResponseGeneric(data);
            const botMessages = generics
              .filter((g) => g.response_type === 'text' && g.text)
              .map((g) => ({ role: 'assistant', content: g.text, id: crypto.randomUUID() }));

            if (botMessages.length === 0) {
              botMessages.push({
                role: 'assistant',
                content: "I'm sorry, I didn't get a response. Please try again.",
                id: crypto.randomUUID(),
              });
            }
            setMessages((prev) => [...prev, ...botMessages]);
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('BuddyChat: stream failed', err);
          setError('Something went wrong sending your message.');
        }
      } finally {
        setStreamingText('');
        setIsLoading(false);
        abortRef.current = null;
      }
    } else {
      try {
        const response = await cam.sendMessage(text.trim(), { anonymous: anonymousRef.current });
        const generics = CamClient.parseResponseGeneric(response);
        const botMessages = generics
          .filter((g) => g.response_type === 'text' && g.text)
          .map((g) => ({ role: 'assistant', content: g.text, id: crypto.randomUUID() }));

        if (botMessages.length === 0) {
          botMessages.push({
            role: 'assistant',
            content: "I'm sorry, I didn't get a response. Please try again.",
            id: crypto.randomUUID(),
          });
        }
        setMessages((prev) => [...prev, ...botMessages]);
      } catch (err) {
        console.error('BuddyChat: message failed', err);
        setError('Something went wrong sending your message.');
      } finally {
        setIsLoading(false);
      }
    }
  }, [isLoading]);

  const retry = useCallback(() => {
    abortRef.current?.abort();
    initRef.current = false;
    setMessages([]);
    setError(null);
    setStreamingText('');
    initialize();
  }, [initialize]);

  return { messages, isLoading, isInitializing, error, sendMessage, retry, streamingText };
}
