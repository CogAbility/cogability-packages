import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthClient } from './auth-client.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const BASE_OPTIONS = {
  authorityUrl: 'https://appid.example.com/oauth/v4/tenant-id',
  clientId: 'test-client-id',
  redirectUri: 'https://example.com/callback',
  tokenEndpointProxy: 'https://cmg.example.com/auth/token',
};

const BOUNDS_KEY = `cogability.session_bounds:${BASE_OPTIONS.clientId}`;

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

/** A fake window that records addEventListener/removeEventListener calls so
 * tests can both dispatch synthetic activity and assert listeners were torn
 * down. */
function makeFakeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    removeEventListener: (event, handler) => {
      listeners.get(event)?.delete(handler);
    },
    _dispatch: (event) => {
      for (const handler of listeners.get(event) ?? []) handler();
    },
    _listenerCount: (event) => listeners.get(event)?.size ?? 0,
  };
}

function makeFakeWindow() {
  return {
    localStorage: makeFakeStorage(),
    sessionStorage: makeFakeStorage(),
    ...makeFakeEventTarget(),
  };
}

function makeFakeDocument() {
  return {
    visibilityState: 'visible',
    ...makeFakeEventTarget(),
  };
}

function makeUser(overrides = {}) {
  return {
    id_token: 'id-token',
    access_token: 'access-token',
    refresh_token: undefined,
    expires_in: 3600,
    expired: false,
    profile: { sub: 'user-123' },
    ...overrides,
  };
}

/** Stateless fake: every method call is independently configurable. */
function makeFakeManager({ getUser, signinSilent, removeUser, storeUser, signinRedirectCallback } = {}) {
  return {
    getUser: vi.fn(getUser ?? (async () => makeUser())),
    signinSilent: vi.fn(signinSilent ?? (async () => makeUser())),
    removeUser: vi.fn(removeUser ?? (async () => {})),
    storeUser: vi.fn(storeUser ?? (async () => {})),
    signinRedirectCallback: vi.fn(signinRedirectCallback ?? (async () => makeUser())),
  };
}

/** Stateful fake: models a real UserManager where removeUser() actually
 * clears what getUser() later returns. Needed for tests asserting that a
 * repeated getUser() call, or the activity monitor's own expiry, does not
 * re-fire onSessionExpired for a session that is already gone. */
function makeStatefulManager(initialUser) {
  let stored = initialUser;
  return {
    getUser: vi.fn(async () => stored),
    removeUser: vi.fn(async () => {
      stored = null;
    }),
    signinSilent: vi.fn(async () => makeUser()),
    storeUser: vi.fn(async (u) => {
      stored = u;
    }),
    signinRedirectCallback: vi.fn(async () => stored),
  };
}

function makeAuth(manager, options = {}) {
  const fakeWindow = makeFakeWindow();
  const fakeDocument = makeFakeDocument();
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', fakeDocument);

  const auth = new AuthClient({ ...BASE_OPTIONS, ...options });
  auth._manager = manager;
  return { auth, window: fakeWindow, document: fakeDocument };
}

function base64url(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A structurally valid, unsigned JWT — enough for signInWithExternalTokens(),
 * which does not verify signatures (App ID/CMG/CAM do that on the way in). */
function makeIdToken(claims = {}) {
  const payload = {
    iss: BASE_OPTIONS.authorityUrl,
    aud: 'some-external-client',
    sub: 'external-user-id',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  };
  return `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url(payload)}.sig-not-checked`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AuthClient – getUser() idle expiry', () => {
  it('returns null, clears the session, and fires onSessionExpired("idle") exactly once when the idle timeout has elapsed', async () => {
    const onSessionExpired = vi.fn();
    const manager = makeFakeManager();
    const { auth } = makeAuth(manager, { idleTimeoutMinutes: 30, onSessionExpired });
    auth._bounds.start(0);

    vi.setSystemTime(30 * MINUTE_MS);

    const user = await auth.getUser();

    expect(user).toBeNull();
    expect(manager.removeUser).toHaveBeenCalledOnce();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledWith('idle');
  });
});

describe('AuthClient – getUser() absolute expiry', () => {
  it('returns null, clears the session, and fires onSessionExpired("absolute") exactly once when the absolute cap has elapsed', async () => {
    const onSessionExpired = vi.fn();
    const manager = makeFakeManager();
    const { auth } = makeAuth(manager, { absoluteCapHours: 12, onSessionExpired });
    auth._bounds.start(0);

    vi.setSystemTime(12 * HOUR_MS);

    const user = await auth.getUser();

    expect(user).toBeNull();
    expect(manager.removeUser).toHaveBeenCalledOnce();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledWith('absolute');
  });
});

describe('AuthClient – bounds are checked before renewal', () => {
  it('does not attempt signinSilent() for an out-of-bounds session even when the stored token would otherwise qualify for renewal', async () => {
    // expired: true + a refresh_token is exactly the shape that triggers
    // renewal — if bounds ran after the renewal check, this would renew.
    const storedUser = makeUser({ expired: true, refresh_token: 'refresh-token' });
    const manager = makeFakeManager({ getUser: async () => storedUser });
    const { auth } = makeAuth(manager);
    auth._bounds.start(0);

    vi.setSystemTime(13 * HOUR_MS);

    const user = await auth.getUser();

    expect(user).toBeNull();
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });
});

describe('AuthClient – getUser() on an in-bounds session', () => {
  it('returns the user and refreshes the idle stamp', async () => {
    const storedUser = makeUser({ expires_in: 3600, expired: false });
    const manager = makeFakeManager({ getUser: async () => storedUser });
    const { auth, window } = makeAuth(manager, { idleTimeoutMinutes: 30 });
    auth._bounds.start(0);

    vi.setSystemTime(5 * MINUTE_MS);
    const user = await auth.getUser();

    expect(user).toBe(storedUser);
    const record = JSON.parse(window.sessionStorage.getItem(BOUNDS_KEY));
    expect(record.lastActivityAt).toBe(5 * MINUTE_MS);
    expect(record.startedAt).toBe(0);
  });

  it('a subsequent getUser() after a further gap still succeeds, because the idle stamp keeps rolling', async () => {
    const storedUser = makeUser({ expires_in: 3600, expired: false });
    const manager = makeFakeManager({ getUser: async () => storedUser });
    const { auth } = makeAuth(manager, { idleTimeoutMinutes: 30 });
    auth._bounds.start(0);

    vi.setSystemTime(5 * MINUTE_MS);
    await auth.getUser();

    // 29 minutes after the refreshed touch (34 total since start) — still
    // under the 30-minute idle window measured from the last touch, even
    // though it is well past 30 minutes since the original start.
    vi.setSystemTime(5 * MINUTE_MS + 29 * MINUTE_MS);
    const user = await auth.getUser();

    expect(user).toBe(storedUser);
  });
});

describe('AuthClient – sessions with no bounds record', () => {
  it('treats a stored user with no bounds record as expired (fail closed) — the pre-existing-session-at-deploy-time case', async () => {
    const manager = makeFakeManager({ getUser: async () => makeUser() });
    const { auth } = makeAuth(manager);
    // Deliberately no auth._bounds.start() — models a session that predates
    // this feature shipping.

    const user = await auth.getUser();

    expect(user).toBeNull();
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });
});

describe('AuthClient – onSessionExpired is fired at most once per cleared session', () => {
  it('does not fire again on a subsequent getUser() call after the session was already cleared', async () => {
    const onSessionExpired = vi.fn();
    const manager = makeStatefulManager(makeUser());
    const { auth } = makeAuth(manager, { onSessionExpired });
    auth._bounds.start(0);

    vi.setSystemTime(13 * HOUR_MS);

    const first = await auth.getUser();
    expect(first).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);

    const second = await auth.getUser();
    expect(second).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the onSessionExpired handler itself throws', async () => {
    const onSessionExpired = vi.fn(() => {
      throw new Error('consumer handler blew up');
    });
    const manager = makeFakeManager();
    const { auth } = makeAuth(manager, { onSessionExpired });
    auth._bounds.start(0);

    vi.setSystemTime(13 * HOUR_MS);

    await expect(auth.getUser()).resolves.toBeNull();
    expect(onSessionExpired).toHaveBeenCalledWith('absolute');
  });
});

describe('AuthClient – stamping bounds on sign-in', () => {
  it('handleCallback() stamps the bounds so an immediately following getUser() succeeds', async () => {
    const user = makeUser();
    const manager = makeFakeManager({
      signinRedirectCallback: async () => user,
      getUser: async () => user,
    });
    const { auth } = makeAuth(manager);

    await auth.handleCallback();
    const result = await auth.getUser();

    expect(result).not.toBeNull();
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });

  it('signInWithExternalTokens() stamps the bounds so an immediately following getUser() succeeds', async () => {
    const manager = makeFakeManager();
    const { auth } = makeAuth(manager);

    await auth.signInWithExternalTokens({
      id_token: makeIdToken(),
      access_token: 'ext-access-token',
      expires_in: 3600,
    });

    const result = await auth.getUser();

    expect(result).not.toBeNull();
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });
});

describe('AuthClient – logout()', () => {
  it('clears the bounds record', async () => {
    const manager = makeFakeManager();
    const { auth } = makeAuth(manager);
    auth._bounds.start(0);
    expect(auth._bounds.hasRecord()).toBe(true);

    await auth.logout();

    expect(auth._bounds.hasRecord()).toBe(false);
  });
});

describe('AuthClient – idleTimeoutMinutes: 0, absoluteCapHours: 0', () => {
  it('returns a stored, unexpired user as-is even with no bounds record, matching pre-feature behavior', async () => {
    const storedUser = makeUser({ expires_in: 3600, expired: false });
    const manager = makeFakeManager({ getUser: async () => storedUser });
    const { auth } = makeAuth(manager, { idleTimeoutMinutes: 0, absoluteCapHours: 0 });
    // Deliberately no auth._bounds.start().

    const user = await auth.getUser();

    expect(user).toBe(storedUser);
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });
});

describe('AuthClient – activity monitor', () => {
  it('expires an idle session via the interval tick, with nobody calling getUser()', async () => {
    const onSessionExpired = vi.fn();
    const manager = makeStatefulManager(makeUser());
    const { auth } = makeAuth(manager, { idleTimeoutMinutes: 2, onSessionExpired });
    auth._bounds.start(0);

    auth.startActivityMonitor();
    await vi.advanceTimersByTimeAsync(2 * MINUTE_MS);

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledWith('idle');
    expect(manager.removeUser).toHaveBeenCalledOnce();
  });

  it('a simulated activity event before the deadline prevents expiry, but does not prevent it forever', async () => {
    const onSessionExpired = vi.fn();
    const manager = makeStatefulManager(makeUser());
    const { auth, window } = makeAuth(manager, { idleTimeoutMinutes: 2, onSessionExpired });
    auth._bounds.start(0);
    auth.startActivityMonitor();

    await vi.advanceTimersByTimeAsync(60 * 1000); // t=60s: still well within the 2-minute window
    window._dispatch('mousedown'); // resets the idle clock at t=60s

    await vi.advanceTimersByTimeAsync(60 * 1000); // t=120s: only 60s since the touch — no expiry
    expect(onSessionExpired).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 1000); // t=180s: 120s since the touch — expires
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledWith('idle');
  });

  it('evaluates bounds immediately on a visibilitychange to "visible", but does nothing while hidden', async () => {
    const onSessionExpired = vi.fn();
    const manager = makeStatefulManager(makeUser());
    const { auth, document } = makeAuth(manager, { idleTimeoutMinutes: 2, onSessionExpired });
    auth._bounds.start(0);
    auth.startActivityMonitor();

    vi.setSystemTime(3 * MINUTE_MS); // past the 2-minute idle window; no interval tick has run yet

    document.visibilityState = 'hidden';
    document._dispatch('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(onSessionExpired).not.toHaveBeenCalled();

    document.visibilityState = 'visible';
    document._dispatch('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(onSessionExpired).toHaveBeenCalledWith('idle');
  });

  it('stopActivityMonitor() removes listeners and stops the interval, so no further expiry fires', async () => {
    const onSessionExpired = vi.fn();
    const manager = makeStatefulManager(makeUser());
    const { auth, window, document } = makeAuth(manager, { idleTimeoutMinutes: 2, onSessionExpired });
    auth._bounds.start(0);
    auth.startActivityMonitor();

    auth.stopActivityMonitor();

    expect(window._listenerCount('mousedown')).toBe(0);
    expect(window._listenerCount('keydown')).toBe(0);
    expect(window._listenerCount('touchstart')).toBe(0);
    expect(window._listenerCount('scroll')).toBe(0);
    expect(document._listenerCount('visibilitychange')).toBe(0);

    await vi.advanceTimersByTimeAsync(10 * MINUTE_MS); // well past idle and absolute
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('the stop function returned by startActivityMonitor() also stops the monitor', async () => {
    const onSessionExpired = vi.fn();
    const manager = makeStatefulManager(makeUser());
    const { auth } = makeAuth(manager, { idleTimeoutMinutes: 2, onSessionExpired });
    auth._bounds.start(0);
    const stop = auth.startActivityMonitor();

    stop();

    await vi.advanceTimersByTimeAsync(10 * MINUTE_MS);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('called twice does not install duplicate listeners or timers, and returns the same stop function', () => {
    const manager = makeStatefulManager(makeUser());
    const { auth, window, document } = makeAuth(manager, { idleTimeoutMinutes: 2 });
    auth._bounds.start(0);

    const stop1 = auth.startActivityMonitor();
    const stop2 = auth.startActivityMonitor();

    expect(stop1).toBe(stop2);
    expect(window._listenerCount('mousedown')).toBe(1);
    expect(window._listenerCount('keydown')).toBe(1);
    expect(window._listenerCount('touchstart')).toBe(1);
    expect(window._listenerCount('scroll')).toBe(1);
    expect(document._listenerCount('visibilitychange')).toBe(1);
  });

  it('does not expire anything when there is no bounds record at all (a visitor who never signed in)', async () => {
    const onSessionExpired = vi.fn();
    const manager = makeStatefulManager(null);
    const { auth } = makeAuth(manager, { idleTimeoutMinutes: 2, onSessionExpired });
    // Deliberately no auth._bounds.start().

    auth.startActivityMonitor();
    await vi.advanceTimersByTimeAsync(10 * MINUTE_MS);

    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(manager.removeUser).not.toHaveBeenCalled();
  });
});
