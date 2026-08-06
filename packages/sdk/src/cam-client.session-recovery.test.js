/**
 * Tests for CamClient's recovery from an expired CAM session.
 *
 * CAM sessions live server-side and expire on their own schedule, so a client
 * can hold a perfectly valid id_token and still be refused. Before this
 * behaviour existed a 401 propagated straight to the UI, which showed a generic
 * "something went wrong" and stayed broken until the page was reloaded — the
 * session was never re-established because init only runs on mount.
 *
 * The cases worth pinning down are the ones a naive retry gets wrong:
 * re-authenticating with a *stale* cached token rather than asking for a fresh
 * one (the id_token usually expires alongside the session, so the replay fails);
 * retrying forever when the second attempt is refused too; re-establishing once
 * per concurrent request instead of once in total; and retrying a request made
 * before any session existed, where there is nothing to restore and the
 * original error is the honest answer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CamClient, CamSessionExpiredError } from './cam-client.js';
import { MemorySessionStore } from './session-store.js';

const SETTOKENS_OK = { uid: 'uid-1' };
const PAYLOAD = { conversations: [] };

function makeCam(options = {}) {
  return new CamClient({
    host: 'https://example.com',
    cogbotId: 'test-cogbot',
    sessionStore: new MemorySessionStore(),
    ...options,
  });
}

function ok(body) {
  return { ok: true, status: 200, json: async () => body };
}

function unauthorized() {
  return {
    ok: false,
    status: 401,
    headers: { get: () => 'text/plain' },
    json: async () => ({}),
  };
}

/** Route responses by URL so settokens and the real call can differ. */
function router({ settokens = () => ok(SETTOKENS_OK), other }) {
  return vi.fn(async (url) =>
    String(url).includes('/api/settokens') ? settokens() : other()
  );
}

describe('CamClient – session recovery on 401', () => {
  let fetchSpy;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('anonymous sessions', () => {
    it('re-establishes and retries, so the caller never sees the 401', async () => {
      let call = 0;
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).includes('/api/settokens')) return ok(SETTOKENS_OK);
        call += 1;
        return call === 1 ? unauthorized() : ok(PAYLOAD);
      });

      const cam = makeCam();
      await cam.initAnonymous();
      await expect(cam.listConversations()).resolves.toEqual(PAYLOAD);

      const settokens = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes('/api/settokens')
      );
      // One for initAnonymous, one for the recovery.
      expect(settokens).toHaveLength(2);
    });

    it('retries only once — a second 401 is surfaced, not looped', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        router({ other: unauthorized })
      );

      const cam = makeCam();
      await cam.initAnonymous();
      await expect(cam.listConversations()).rejects.toThrow('401');

      const attempts = fetchSpy.mock.calls.filter(
        (c) => !String(c[0]).includes('/api/settokens')
      );
      expect(attempts).toHaveLength(2);
    });
  });

  describe('authenticated sessions', () => {
    it('asks getIdToken for a FRESH token rather than replaying the stale one', async () => {
      const getIdToken = vi.fn().mockResolvedValue('fresh-token');
      let call = 0;
      const bodies = [];

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        if (String(url).includes('/api/settokens')) {
          bodies.push(JSON.parse(init.body).tokens.idToken);
          return ok(SETTOKENS_OK);
        }
        call += 1;
        return call === 1 ? unauthorized() : ok(PAYLOAD);
      });

      const cam = makeCam({ getIdToken });
      await cam.initAuthenticated('stale-token');
      await expect(cam.listConversations()).resolves.toEqual(PAYLOAD);

      expect(getIdToken).toHaveBeenCalledTimes(1);
      expect(bodies).toEqual(['stale-token', 'fresh-token']);
    });

    it('falls back to the token from initAuthenticated when no getIdToken is given', async () => {
      let call = 0;
      const bodies = [];

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        if (String(url).includes('/api/settokens')) {
          bodies.push(JSON.parse(init.body).tokens.idToken);
          return ok(SETTOKENS_OK);
        }
        call += 1;
        return call === 1 ? unauthorized() : ok(PAYLOAD);
      });

      const cam = makeCam();
      await cam.initAuthenticated('only-token');
      await expect(cam.listConversations()).resolves.toEqual(PAYLOAD);
      expect(bodies).toEqual(['only-token', 'only-token']);
    });

    it('raises CamSessionExpiredError when the id_token has expired too', async () => {
      // The realistic case: session and token lapse together, so settokens is
      // refused as well and the only way forward is an interactive login.
      fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(router({ settokens: unauthorized, other: unauthorized }));

      const cam = makeCam({ getIdToken: () => 'expired-token' });
      // Establish first, while settokens still works.
      fetchSpy.mockImplementationOnce(async () => ok(SETTOKENS_OK));
      await cam.initAuthenticated('expired-token');

      await expect(cam.listConversations()).rejects.toBeInstanceOf(CamSessionExpiredError);
    });

    it('raises CamSessionExpiredError when getIdToken yields nothing', async () => {
      let call = 0;
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).includes('/api/settokens')) return ok(SETTOKENS_OK);
        call += 1;
        return call === 1 ? unauthorized() : ok(PAYLOAD);
      });

      const cam = makeCam({ getIdToken: () => null });
      await cam.initAuthenticated('a-token');
      cam._idToken = null; // signed out underneath us

      await expect(cam.listConversations()).rejects.toBeInstanceOf(CamSessionExpiredError);
    });

    it('raises CamSessionExpiredError when getIdToken itself throws', async () => {
      let call = 0;
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).includes('/api/settokens')) return ok(SETTOKENS_OK);
        call += 1;
        return call === 1 ? unauthorized() : ok(PAYLOAD);
      });

      const cam = makeCam({
        getIdToken: () => {
          throw new Error('storage unavailable');
        },
      });
      await cam.initAuthenticated('a-token');

      await expect(cam.listConversations()).rejects.toBeInstanceOf(CamSessionExpiredError);
    });
  });

  describe('no session established', () => {
    it('passes the 401 straight through, unchanged', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        router({ other: unauthorized })
      );

      const cam = makeCam();
      await expect(cam.listConversations()).rejects.toThrow('401');

      // No recovery attempted: nothing to restore, and settokens was never called.
      expect(
        fetchSpy.mock.calls.filter((c) => String(c[0]).includes('/api/settokens'))
      ).toHaveLength(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('concurrency', () => {
    it('re-establishes once for several simultaneous 401s', async () => {
      const seen = new Set();
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const u = String(url);
        if (u.includes('/api/settokens')) return ok(SETTOKENS_OK);
        // Refuse the first attempt of each distinct call, allow the retry.
        const key = u.split('rcode=')[0];
        if (!seen.has(key)) {
          seen.add(key);
          return unauthorized();
        }
        return ok(PAYLOAD);
      });

      const cam = makeCam();
      await cam.initAnonymous();

      await Promise.all([
        cam.listConversations(),
        cam.fetchConversationHistory('chat-1'),
        cam.initCogbot(),
      ]);

      const settokens = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes('/api/settokens')
      );
      // initAnonymous plus exactly one shared recovery, not one per caller.
      expect(settokens).toHaveLength(2);
    });
  });

  describe('non-401 errors', () => {
    it('does not attempt recovery on a 500', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        router({
          other: () => ({
            ok: false,
            status: 500,
            headers: { get: () => 'text/plain' },
            json: async () => ({}),
          }),
        })
      );

      const cam = makeCam();
      await cam.initAnonymous();
      await expect(cam.listConversations()).rejects.toThrow('500');

      const settokens = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes('/api/settokens')
      );
      expect(settokens).toHaveLength(1); // initAnonymous only
    });

    it('does not attempt recovery on a 429 turn limit', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        router({
          other: () => ({
            ok: false,
            status: 429,
            headers: { get: () => 'application/json' },
            json: async () => ({ detail: { code: 'anon_turn_limit' } }),
          }),
        })
      );

      const cam = makeCam();
      await cam.initAnonymous();
      await expect(cam.sendMessage('hi')).rejects.toMatchObject({ status: 429 });

      const settokens = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes('/api/settokens')
      );
      expect(settokens).toHaveLength(1);
    });
  });

  describe('streaming', () => {
    it('recovers when the stream is refused before any event is yielded', async () => {
      const sse =
        'event: final_response\ndata: {"text":"hello"}\n\n';
      let call = 0;

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).includes('/api/settokens')) return ok(SETTOKENS_OK);
        call += 1;
        if (call === 1) return unauthorized();
        return {
          ok: true,
          status: 200,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(sse));
              controller.close();
            },
          }),
        };
      });

      const cam = makeCam();
      await cam.initAnonymous();

      const events = [];
      for await (const event of cam.streamMessage('hi')) events.push(event);

      expect(events.length).toBeGreaterThan(0);
      expect(call).toBe(2);
    });
  });
});
