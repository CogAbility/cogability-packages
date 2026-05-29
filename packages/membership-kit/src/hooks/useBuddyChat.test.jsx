/**
 * useBuddyChat tests
 *
 * The module-level `cam` singleton from buddyApi is replaced with a
 * lightweight mock so we don't need a running CAM server.  We verify that:
 *
 * 1. retry() calls cam.rotateChatId() BEFORE re-running initialization.
 * 2. After retry(), messages are cleared.
 * 3. A fresh greeting is shown after retry() completes.
 * 4. fetchConversationHistory() delegates to cam.fetchConversationHistory().
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock buddyApi BEFORE importing useBuddyChat so the module-level `cam`
// inside useBuddyChat.js is replaced.
// ---------------------------------------------------------------------------
const callOrder = [];

const mockCam = {
  initAnonymous: vi.fn(async () => { callOrder.push('initAnonymous'); }),
  initAuthenticated: vi.fn(async () => { callOrder.push('initAuthenticated'); }),
  initCogbot: vi.fn(async () => { callOrder.push('initCogbot'); return { config: { streaming: false } }; }),
  fetchGreeting: vi.fn(async () => {
    callOrder.push('fetchGreeting');
    return { output: [{ response_type: 'text', text: 'Hello! How can I help?' }] };
  }),
  streamMessage: vi.fn(),
  sendMessage: vi.fn(),
  rotateChatId: vi.fn(() => { callOrder.push('rotateChatId'); return 'new-chat-id'; }),
  fetchConversationHistory: vi.fn(async () => ({
    thread_id: 't1',
    chat_id: 'c1',
    turns: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }],
    transcript_text: 'User: Hi\nAssistant: Hello',
    summary: null,
  })),
};

vi.mock('../services/buddyApi', () => ({
  cam: mockCam,
}));

// Import AFTER mocking
const { default: useBuddyChat } = await import('./useBuddyChat.js');

describe('useBuddyChat', () => {
  beforeEach(() => {
    callOrder.length = 0;
    vi.clearAllMocks();
    // Re-apply default implementations
    mockCam.initCogbot.mockResolvedValue({ config: { streaming: false } });
    mockCam.fetchGreeting.mockResolvedValue({
      output: [{ response_type: 'text', text: 'Hello! How can I help?' }],
    });
    mockCam.rotateChatId.mockImplementation(() => { callOrder.push('rotateChatId'); return 'new-chat-id'; });
    mockCam.initAnonymous.mockImplementation(async () => { callOrder.push('initAnonymous'); });
    mockCam.initCogbot.mockImplementation(async () => {
      callOrder.push('initCogbot');
      return { config: { streaming: false } };
    });
    mockCam.fetchGreeting.mockImplementation(async () => {
      callOrder.push('fetchGreeting');
      return { output: [{ response_type: 'text', text: 'Hello! How can I help?' }] };
    });
  });

  it('initializes and shows greeting on mount', async () => {
    const { result } = renderHook(() => useBuddyChat());

    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello! How can I help?');
  });

  it('retry() calls rotateChatId() before initialize()', async () => {
    const { result } = renderHook(() => useBuddyChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    callOrder.length = 0;

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    const rotateIdx = callOrder.indexOf('rotateChatId');
    const initIdx = callOrder.indexOf('initAnonymous');
    expect(rotateIdx).toBeGreaterThanOrEqual(0);
    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(rotateIdx).toBeLessThan(initIdx);
  });

  it('retry() clears messages', async () => {
    const { result } = renderHook(() => useBuddyChat());
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    // Delay greeting on retry so we can observe the cleared state briefly
    mockCam.fetchGreeting.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => {
        callOrder.push('fetchGreeting');
        resolve({ output: [{ response_type: 'text', text: 'Fresh greeting' }] });
      }, 20))
    );

    act(() => { result.current.retry(); });

    await waitFor(() => expect(result.current.messages).toHaveLength(0));
  });

  it('retry() shows a fresh greeting after re-initialization', async () => {
    const { result } = renderHook(() => useBuddyChat());
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    mockCam.fetchGreeting.mockImplementation(async () => {
      callOrder.push('fetchGreeting');
      return { output: [{ response_type: 'text', text: 'Fresh greeting' }] };
    });

    await act(async () => { result.current.retry(); });
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Fresh greeting');
  });

  it('limitReached is set when sendMessage throws a 429 error (anonymous)', async () => {
    mockCam.sendMessage.mockRejectedValueOnce({ status: 429, code: 'anon_turn_limit' });

    const { result } = renderHook(() => useBuddyChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    expect(result.current.limitReached).toBe(false);

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(result.current.limitReached).toBe(true);
    // Optimistic user message must be rolled back; only the greeting remains
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('assistant');
  });

  it('limitReached detected via err.body.detail.code', async () => {
    mockCam.sendMessage.mockRejectedValueOnce({ body: { detail: { code: 'anon_turn_limit' } } });

    const { result } = renderHook(() => useBuddyChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    await act(async () => { await result.current.sendMessage('hello'); });

    expect(result.current.limitReached).toBe(true);
  });

  it('sendMessage is a no-op when limitReached is already true', async () => {
    mockCam.sendMessage.mockRejectedValueOnce({ status: 429 });

    const { result } = renderHook(() => useBuddyChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    await act(async () => { await result.current.sendMessage('first'); });
    expect(result.current.limitReached).toBe(true);

    const msgCountAfterLimit = result.current.messages.length;
    mockCam.sendMessage.mockClear();

    await act(async () => { await result.current.sendMessage('second'); });

    expect(mockCam.sendMessage).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(msgCountAfterLimit);
  });

  it('limitReached persists across retry() for anonymous sessions', async () => {
    mockCam.sendMessage.mockRejectedValueOnce({ status: 429 });

    const { result } = renderHook(() => useBuddyChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    await act(async () => { await result.current.sendMessage('hello'); });
    expect(result.current.limitReached).toBe(true);

    await act(async () => { result.current.retry(); });
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    expect(result.current.limitReached).toBe(true);
  });

  it('turnsPerDay is read from initCogbot config anonymous_limits', async () => {
    mockCam.initCogbot.mockResolvedValueOnce({
      config: { streaming: false, anonymous_limits: { turns_per_day: 10 } },
    });

    const { result } = renderHook(() => useBuddyChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    expect(result.current.turnsPerDay).toBe(10);
    expect(result.current.remaining).toBe(10);
  });

  it('turnsPerDay is null when anonymous_limits absent', async () => {
    const { result } = renderHook(() => useBuddyChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    expect(result.current.turnsPerDay).toBeNull();
    expect(result.current.remaining).toBeNull();
  });

  it('fetchConversationHistory() returns history from cam', async () => {
    const { result } = renderHook(() => useBuddyChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    let history;
    await act(async () => {
      history = await result.current.fetchConversationHistory();
    });

    expect(mockCam.fetchConversationHistory).toHaveBeenCalledOnce();
    expect(history.turns).toHaveLength(2);
    expect(history.chat_id).toBe('c1');
  });
});
