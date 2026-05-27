import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CamClient } from './cam-client.js';
import { MemorySessionStore } from './session-store.js';

const FAKE_HISTORY = {
  thread_id: 'test-cogbot:user123:chat:abc-123:general',
  chat_id: 'abc-123',
  turns: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ],
  transcript_text: 'User: Hello\nAssistant: Hi there!',
  summary: null,
};

function makeCam(sidValue = '') {
  const store = new MemorySessionStore();
  if (sidValue) store.set('buddy_cogbot_sid', sidValue);
  return new CamClient({
    host: 'https://example.com',
    cogbotId: 'test-cogbot',
    sessionStore: store,
  });
}

describe('CamClient – fetchConversationHistory', () => {
  let cam;
  let fetchSpy;

  beforeEach(() => {
    cam = makeCam();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => FAKE_HISTORY,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the correct URL path', async () => {
    await cam.fetchConversationHistory();
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/api/cogbots/test-cogbot/id/');
    expect(url).toContain('/conversation-history');
  });

  it('includes chat_id as a query parameter', async () => {
    const chatId = cam._getChatId();
    await cam.fetchConversationHistory();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(`chat_id=${chatId}`);
  });

  it('includes rcode cache-buster query parameter', async () => {
    await cam.fetchConversationHistory();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/rcode=\d+/);
  });

  it('includes cogbot_sid when a session id is present', async () => {
    const camWithSid = makeCam('test-session-id-abc');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => FAKE_HISTORY });
    await camWithSid.fetchConversationHistory();
    const [url] = fetch.mock.calls[0];
    expect(url).toContain('cogbot_sid=test-session-id-abc');
  });

  it('omits cogbot_sid when session id is absent', async () => {
    await cam.fetchConversationHistory();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).not.toContain('cogbot_sid');
  });

  it('returns parsed JSON from the response', async () => {
    const result = await cam.fetchConversationHistory();
    expect(result).toEqual(FAKE_HISTORY);
  });

  it('throws when the server returns a non-ok status', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 503 });
    await expect(cam.fetchConversationHistory()).rejects.toThrow('503');
  });

  it('uses the uid from sessionStorage for the URL', async () => {
    const uid = cam._getUid();
    await cam.fetchConversationHistory();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(`/id/${uid}/`);
  });

  it('uses the rotated chat_id after rotateChatId()', async () => {
    cam._getChatId();
    const newId = cam.rotateChatId();
    await cam.fetchConversationHistory();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(`chat_id=${newId}`);
  });

  it('uses an explicit chatId when provided, ignoring the stored chat_id', async () => {
    const storedId = cam._getChatId();
    const explicitId = 'explicit-chat-id-abc-123';
    expect(explicitId).not.toBe(storedId);
    await cam.fetchConversationHistory(explicitId);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(`chat_id=${explicitId}`);
    expect(url).not.toContain(`chat_id=${storedId}`);
  });

  it('falls back to stored chat_id when explicit chatId is undefined', async () => {
    const storedId = cam._getChatId();
    await cam.fetchConversationHistory(undefined);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(`chat_id=${storedId}`);
  });
});
