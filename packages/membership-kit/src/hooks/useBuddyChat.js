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
 * Returns { messages, isLoading, isInitializing, error, sendMessage, retry, streamingText,
 *           fetchConversationHistory, isAnonymous, turnsPerDay, remaining, limitReached }.
 *
 * retry() rotates the chat_id before re-initializing so PFC2 starts a fresh
 * RAG checkpoint (general_thread_id) for the new conversation.
 *
 * limitReached is sticky for the session once set — daily limits persist across
 * new chats for the same anonymous uid.
 */

function _utcDateStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
function _anonLimitKey(cogbotId) {
  return `buddy_anon_limit:${cogbotId}:${_utcDateStr()}`;
}
function _loadAnonLimit(cogbotId) {
  try {
    const raw = localStorage.getItem(_anonLimitKey(cogbotId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.used === 'number' && typeof p.reached === 'boolean') return p;
  } catch {}
  return null;
}
function _saveAnonLimit(cogbotId, used, reached) {
  try {
    localStorage.setItem(_anonLimitKey(cogbotId), JSON.stringify({ used, reached }));
  } catch {}
}

function isAnonymousLimitError(err) {
  return (
    err?.status === 429 ||
    err?.code === 'anon_turn_limit' ||
    err?.body?.detail?.code === 'anon_turn_limit' ||
    err?.body?.code === 'anon_turn_limit' ||
    String(err?.message ?? '').includes('(429)')
  );
}

export default function useBuddyChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const [turnsPerDay, setTurnsPerDay] = useState(null);
  const [turnsUsed, setTurnsUsed] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const initRef = useRef(false);
  const streamingRef = useRef(false);
  const abortRef = useRef(null);
  const rafIdRef = useRef(null);
  const anonymousRef = useRef(true);
  const turnsUsedRef = useRef(0);

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

      const rawLimit = initData?.config?.anonymous_limits?.turns_per_day ?? null;
      setTurnsPerDay(typeof rawLimit === 'number' ? rawLimit : null);

      if (anonymousRef.current) {
        const saved = _loadAnonLimit(cam.cogbotId);
        if (saved) {
          setTurnsUsed(saved.used);
          turnsUsedRef.current = saved.used;
          setLimitReached(saved.reached);
        }
      }

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
    if (!text.trim() || isLoading || limitReached) return;

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
        if (anonymousRef.current) setTurnsUsed((n) => {
          const next = n + 1;
          turnsUsedRef.current = next;
          _saveAnonLimit(cam.cogbotId, next, false);
          return next;
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          // intentional abort, no-op
        } else if (isAnonymousLimitError(err) && anonymousRef.current) {
          setLimitReached(true);
          _saveAnonLimit(cam.cogbotId, turnsUsedRef.current, true);
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        } else {
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
        if (anonymousRef.current) setTurnsUsed((n) => {
          const next = n + 1;
          turnsUsedRef.current = next;
          _saveAnonLimit(cam.cogbotId, next, false);
          return next;
        });
      } catch (err) {
        if (isAnonymousLimitError(err) && anonymousRef.current) {
          setLimitReached(true);
          _saveAnonLimit(cam.cogbotId, turnsUsedRef.current, true);
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        } else {
          console.error('BuddyChat: message failed', err);
          setError('Something went wrong sending your message.');
        }
      } finally {
        setIsLoading(false);
      }
    }
  }, [isLoading, limitReached]);

  const retry = useCallback(() => {
    abortRef.current?.abort();
    // Rotate chat_id first so PFC2 opens a new RAG checkpoint on the next turn.
    cam.rotateChatId();
    initRef.current = false;
    setMessages([]);
    setError(null);
    setStreamingText('');
    // limitReached and turnsUsed are intentionally NOT reset here:
    // anonymous daily limits persist across new chats for the same uid.
    initialize();
  }, [initialize]);

  const fetchConversationHistory = useCallback(() => {
    return cam.fetchConversationHistory();
  }, []);

  const remaining = turnsPerDay != null ? Math.max(0, turnsPerDay - turnsUsed) : null;

  return {
    messages,
    isLoading,
    isInitializing,
    error,
    sendMessage,
    retry,
    streamingText,
    fetchConversationHistory,
    isAnonymous: anonymousRef.current,
    turnsPerDay,
    remaining,
    limitReached,
  };
}
