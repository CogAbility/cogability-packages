import { describe, it, expect, afterEach, vi } from 'vitest';
import { AuthClient } from './auth-client.js';

const BASE_OPTIONS = {
  authorityUrl: 'https://appid.example.com/oauth/v4/tenant-id',
  clientId: 'test-client-id',
  redirectUri: 'https://example.com/callback',
  tokenEndpointProxy: 'https://cmg.example.com/auth/token',
};

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function makeFakeWindow() {
  return { localStorage: makeFakeStorage(), sessionStorage: makeFakeStorage() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeUser(overrides = {}) {
  return {
    id_token: 'stale-id-token',
    access_token: 'stale-access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expired: false,
    profile: { sub: 'user-123' },
    ...overrides,
  };
}

function makeRenewedUser(overrides = {}) {
  return makeUser({
    id_token: 'renewed-id-token',
    access_token: 'renewed-access-token',
    expires_in: 3600,
    expired: false,
    ...overrides,
  });
}

function makeFakeManager({ getUser, signinSilent } = {}) {
  return {
    getUser: vi.fn(getUser ?? (async () => null)),
    signinSilent: vi.fn(signinSilent ?? (async () => makeRenewedUser())),
  };
}

/**
 * A fake user with no session-bounds record is, by the fail-closed contract
 * of `SessionBounds.check()`, an *expired* session — indistinguishable from a
 * stolen or pre-existing token. These renewal tests are about a genuinely
 * signed-in member, so give the client a real window (with working storage)
 * and stamp a fresh, in-bounds bounds record the same way `handleCallback()`
 * would, via the public `_bounds.start()` surface rather than writing the
 * storage JSON by hand.
 */
function makeAuth(manager) {
  vi.stubGlobal('window', makeFakeWindow());
  const auth = new AuthClient(BASE_OPTIONS);
  auth._manager = manager;
  auth._bounds.start();
  return auth;
}

describe('AuthClient – getUser silent renewal', () => {
  it('_getManager() returns the pre-assigned fake manager without dynamic import', async () => {
    const manager = makeFakeManager();
    const auth = makeAuth(manager);

    const resolved = await auth._getManager();

    expect(resolved).toBe(manager);
  });

  it('resolves to null when there is no stored user', async () => {
    const manager = makeFakeManager({ getUser: async () => null });
    const auth = makeAuth(manager);

    const user = await auth.getUser();

    expect(user).toBeNull();
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });

  it('returns a stored user as-is when it is not near expiry', async () => {
    const storedUser = makeUser({ expires_in: 3600, expired: false });
    const manager = makeFakeManager({ getUser: async () => storedUser });
    const auth = makeAuth(manager);

    const user = await auth.getUser();

    expect(user).toBe(storedUser);
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });

  it('renews a user within the renewal skew that has a refresh_token', async () => {
    const storedUser = makeUser({ expires_in: 60, expired: false, refresh_token: 'refresh-token' });
    const renewedUser = makeRenewedUser();
    const manager = makeFakeManager({
      getUser: async () => storedUser,
      signinSilent: async () => renewedUser,
    });
    const auth = makeAuth(manager);

    const user = await auth.getUser();

    expect(manager.signinSilent).toHaveBeenCalledOnce();
    expect(user).toBe(renewedUser);
  });

  it('renews an expired user that has a refresh_token', async () => {
    const storedUser = makeUser({ expired: true, refresh_token: 'refresh-token' });
    const renewedUser = makeRenewedUser();
    const manager = makeFakeManager({
      getUser: async () => storedUser,
      signinSilent: async () => renewedUser,
    });
    const auth = makeAuth(manager);

    const user = await auth.getUser();

    expect(manager.signinSilent).toHaveBeenCalledOnce();
    expect(user).toBe(renewedUser);
  });

  it('resolves to null for an expired user with no refresh_token', async () => {
    const storedUser = makeUser({ expired: true, refresh_token: undefined });
    const manager = makeFakeManager({ getUser: async () => storedUser });
    const auth = makeAuth(manager);

    const user = await auth.getUser();

    expect(user).toBeNull();
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });

  it('returns a merely near-expiry (not expired) user with no refresh_token as-is', async () => {
    const storedUser = makeUser({ expires_in: 60, expired: false, refresh_token: undefined });
    const manager = makeFakeManager({ getUser: async () => storedUser });
    const auth = makeAuth(manager);

    const user = await auth.getUser();

    expect(user).toBe(storedUser);
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });

  it('resolves to null (not the stale user, not a throw) when signinSilent rejects', async () => {
    const storedUser = makeUser({ expired: true, refresh_token: 'refresh-token' });
    const manager = makeFakeManager({
      getUser: async () => storedUser,
      signinSilent: async () => {
        throw new Error('refresh_token grant failed');
      },
    });
    const auth = makeAuth(manager);

    await expect(auth.getUser()).resolves.toBeNull();
  });

  describe('concurrency', () => {
    it('collapses two simultaneous calls onto a single signinSilent(), and clears the dedupe for a later call', async () => {
      const storedUser = makeUser({ expired: true, refresh_token: 'refresh-token' });
      const renewedUser = makeRenewedUser();
      const manager = makeFakeManager({
        getUser: async () => storedUser,
        signinSilent: async () => renewedUser,
      });
      const auth = makeAuth(manager);

      const [userA, userB] = await Promise.all([auth.getUser(), auth.getUser()]);

      expect(manager.signinSilent).toHaveBeenCalledOnce();
      expect(userA).toBe(renewedUser);
      expect(userB).toBe(renewedUser);

      // The in-flight dedupe promise must be cleared after settling, not cached forever.
      const userC = await auth.getUser();

      expect(manager.signinSilent).toHaveBeenCalledTimes(2);
      expect(userC).toBe(renewedUser);
    });
  });
});

describe('AuthClient – getIdToken', () => {
  it('returns null when there is no stored user', async () => {
    const manager = makeFakeManager({ getUser: async () => null });
    const auth = makeAuth(manager);

    const idToken = await auth.getIdToken();

    expect(idToken).toBeNull();
  });

  it('returns the id_token of the renewed user when the stored one was expired', async () => {
    const storedUser = makeUser({ expired: true, refresh_token: 'refresh-token' });
    const renewedUser = makeRenewedUser({ id_token: 'brand-new-id-token' });
    const manager = makeFakeManager({
      getUser: async () => storedUser,
      signinSilent: async () => renewedUser,
    });
    const auth = makeAuth(manager);

    const idToken = await auth.getIdToken();

    expect(idToken).toBe('brand-new-id-token');
    expect(manager.signinSilent).toHaveBeenCalledOnce();
  });
});
