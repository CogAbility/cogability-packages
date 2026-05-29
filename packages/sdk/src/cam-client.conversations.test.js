import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CamClient } from './cam-client.js';
import { MemorySessionStore } from './session-store.js';

const FAKE_CONVERSATIONS = {
  conversations: [
    {
      chat_id: 'chat-uuid-1',
      last_updated: '2026-05-20T12:00:00Z',
      title: 'First conversation',
      turn_count: 4,
    },
    {
      chat_id: 'chat-uuid-2',
      last_updated: '2026-05-21T09:30:00Z',
      title: null,
      turn_count: 2,
    },
  ],
};

function makeCam() {
  return new CamClient({
    host: 'https://example.com',
    cogbotId: 'test-cogbot',
    sessionStore: new MemorySessionStore(),
  });
}

describe('CamClient – listConversations', () => {
  let cam;
  let fetchSpy;

  beforeEach(() => {
    cam = makeCam();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => FAKE_CONVERSATIONS,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fetch exactly once', async () => {
    await cam.listConversations();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('calls the correct URL path', async () => {
    const uid = cam._getUid();
    await cam.listConversations();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/api/cogbots/test-cogbot/id/');
    expect(url).toContain(`/id/${uid}/conversations`);
  });

  it('URL contains the cogbotId', async () => {
    await cam.listConversations();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/api/cogbots/test-cogbot/');
  });

  it('URL contains /conversations path segment', async () => {
    await cam.listConversations();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/conversations');
  });

  it('URL includes cache-busting rcode query param', async () => {
    await cam.listConversations();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/[?&]rcode=\d+/);
  });

  it('URL includes cogbot_sid when a sid is stored in the session', async () => {
    // Seed a sid into the session (simulating what _handleSid does after init)
    cam._setSid('test-sid-value');
    await cam.listConversations();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('cogbot_sid=test-sid-value');
  });

  it('URL does not include cogbot_sid when no sid is stored', async () => {
    // Fresh cam — no sid set
    await cam.listConversations();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).not.toContain('cogbot_sid');
  });

  it('uses credentials: include', async () => {
    await cam.listConversations();
    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.credentials).toBe('include');
  });

  it('returns the parsed JSON response', async () => {
    const result = await cam.listConversations();
    expect(result).toEqual(FAKE_CONVERSATIONS);
  });

  it('throws on a 401 response', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 401 });
    await expect(cam.listConversations()).rejects.toThrow('401');
  });

  it('throws on a 500 response', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500 });
    await expect(cam.listConversations()).rejects.toThrow('500');
  });

  it('error message mentions listConversations', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 403 });
    await expect(cam.listConversations()).rejects.toThrow('listConversations');
  });

  it('URL is built using the host option', async () => {
    await cam.listConversations();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/^https:\/\/example\.com\//);
  });

  it('URL-encodes a cogbotId that contains special characters', async () => {
    const specialCam = new CamClient({
      host: 'https://example.com',
      cogbotId: 'mc_0091:full',
      sessionStore: new MemorySessionStore(),
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ conversations: [] }),
    });
    await specialCam.listConversations();
    const [url] = fetch.mock.calls[0];
    expect(url).toContain('mc_0091%3Afull');
  });
});
