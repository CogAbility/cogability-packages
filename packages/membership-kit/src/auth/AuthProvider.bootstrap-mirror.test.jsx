/**
 * AuthProvider – bootstrap sessionStorage mirror cleanup tests
 *
 * `@cogability/sdk` is mocked the same way the sibling AuthProvider test files
 * do. Unlike those files, `getUser()`'s resolved value needs to vary per test
 * (null / expired / valid) to drive the bootstrap rehydrate effect, so the
 * mock instance's `getUser` delegates to a shared `getUserBehavior.impl` that
 * each test overrides before rendering.
 *
 * This covers the second-tab gap: `AuthClient._expireSession()` only invokes
 * `onSessionExpired` when it actually removed a *stored* OIDC session. The
 * OIDC session is shared across tabs (localStorage under `persistSession:
 * true`), but the `cam_token` / `cam_access_token` mirror is per-tab
 * sessionStorage. So when tab A hits a bound and clears the shared session,
 * tab B reloading afterwards has `getUser()` resolve to `null` with no
 * callback fired at all — the only place left to notice and drop tab B's
 * stale mirror is the bootstrap effect itself. The same gap applies to a
 * bootstrap read of a user that is already `expired` on arrival.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider.jsx';
import { AuthClient, CmgClient } from '@cogability/sdk';

const VALID_OIDC_USER = {
  expired: false,
  id_token: 'valid-id-token',
  access_token: 'valid-access-token',
  profile: { sub: 'user-1', email: 'member@example.com', given_name: 'Ada', family_name: 'Lovelace' },
};

const EXPIRED_OIDC_USER = {
  expired: true,
  id_token: 'expired-id-token',
  access_token: 'expired-access-token',
  profile: { sub: 'user-1', email: 'member@example.com' },
};

// Mutable so each test can control what the bootstrap effect's auth.getUser()
// call resolves to, without needing per-test module resets.
const getUserBehavior = { impl: async () => null };

vi.mock('@cogability/sdk', () => {
  const AuthClient = vi.fn(function AuthClient(options) {
    this.options = options;
    this.getUser = vi.fn((...args) => getUserBehavior.impl(...args));
    this.login = vi.fn(async () => {});
    this.handleCallback = vi.fn(async () => ({ user: null, idToken: null, accessToken: null }));
    this.logout = vi.fn(async () => {});
    this.startActivityMonitor = vi.fn(() => vi.fn());
    this.stopActivityMonitor = vi.fn();
  });
  const CmgClient = vi.fn(function CmgClient(options) {
    this.options = options;
    this.checkGeofence = vi.fn(async () => ({ geofenced: false, message: null }));
    this.validateMembership = vi.fn(async () => ({
      isMember: false,
      autoProvisioned: false,
      hasProfile: false,
      roles: [],
      geofenced: false,
      geofenceMessage: null,
      codeRequired: false,
    }));
  });
  return { AuthClient, CmgClient };
});

function makeWrapper(providerProps) {
  return function Wrapper({ children }) {
    return <AuthProvider {...providerProps}>{children}</AuthProvider>;
  };
}

describe('AuthProvider – bootstrap sessionStorage mirror cleanup', () => {
  beforeEach(() => {
    AuthClient.mockClear();
    CmgClient.mockClear();
    sessionStorage.clear();
    getUserBehavior.impl = async () => null;
  });

  afterEach(() => {
    cleanup();
  });

  it('clears a stale cam_token/cam_access_token mirror when getUser() finds no session (second-tab case)', async () => {
    // Simulate the second tab: another tab already ended the shared OIDC
    // session, but this tab's own sessionStorage mirror is untouched.
    sessionStorage.setItem('cam_token', 'stale-id-token');
    sessionStorage.setItem('cam_access_token', 'stale-access-token');
    getUserBehavior.impl = async () => null;

    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });

    await waitFor(() => {
      expect(sessionStorage.getItem('cam_token')).toBeNull();
    });
    expect(sessionStorage.getItem('cam_access_token')).toBeNull();
    expect(hook.result.current.isAuthenticated).toBe(false);
    expect(hook.result.current.user).toBeNull();
  });

  it('clears a stale mirror when getUser() resolves a user that is already expired', async () => {
    sessionStorage.setItem('cam_token', 'stale-id-token');
    sessionStorage.setItem('cam_access_token', 'stale-access-token');
    getUserBehavior.impl = async () => EXPIRED_OIDC_USER;

    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });

    await waitFor(() => {
      expect(sessionStorage.getItem('cam_token')).toBeNull();
    });
    expect(sessionStorage.getItem('cam_access_token')).toBeNull();
    expect(hook.result.current.isAuthenticated).toBe(false);
    expect(hook.result.current.user).toBeNull();
  });

  it('populates the mirror from a valid, unexpired session and does NOT clear it', async () => {
    getUserBehavior.impl = async () => VALID_OIDC_USER;

    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });

    await waitFor(() => {
      expect(hook.result.current.isAuthenticated).toBe(true);
    });
    expect(sessionStorage.getItem('cam_token')).toBe(VALID_OIDC_USER.id_token);
    expect(sessionStorage.getItem('cam_access_token')).toBe(VALID_OIDC_USER.access_token);
    expect(hook.result.current.user?.idToken).toBe(VALID_OIDC_USER.id_token);
  });

  it('leaves auth_return_to alone when bootstrap finds no session, so the post-login redirect survives', async () => {
    // The login redirect target is written before the App ID redirect and read
    // back only once handleCallback() resolves. Bootstrap's getUser() is a
    // local storage read that settles first and, on the /callback page, finds
    // no session yet — so folding auth_return_to into this cleanup would wipe
    // the target on every login and land everyone on /members.
    sessionStorage.setItem('cam_token', 'stale-id-token');
    sessionStorage.setItem('auth_return_to', '/guides/sleep');
    getUserBehavior.impl = async () => null;

    await act(async () => {
      renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });

    await waitFor(() => {
      expect(sessionStorage.getItem('cam_token')).toBeNull();
    });
    expect(sessionStorage.getItem('auth_return_to')).toBe('/guides/sleep');
  });

  it('discards auth_return_to on a deliberate logout', async () => {
    getUserBehavior.impl = async () => VALID_OIDC_USER;
    sessionStorage.setItem('auth_return_to', '/guides/sleep');

    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });
    await waitFor(() => {
      expect(hook.result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await hook.result.current.logout();
    });

    expect(sessionStorage.getItem('auth_return_to')).toBeNull();
    expect(sessionStorage.getItem('cam_token')).toBeNull();
  });

  it('mounts and rehydrates without throwing, guarding against the clearTokenMirror TDZ hazard', async () => {
    // clearTokenMirror is declared above this effect specifically so it is
    // not in its own temporal dead zone when the effect's dependency array
    // is evaluated at render time. If that declaration were ever moved back
    // below the effect, this render would throw a ReferenceError
    // synchronously, and the act() below would reject.
    getUserBehavior.impl = async () => VALID_OIDC_USER;

    let hook;
    let renderError = null;
    try {
      await act(async () => {
        hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
      });
    } catch (err) {
      renderError = err;
    }

    expect(renderError).toBeNull();
    await waitFor(() => {
      expect(hook.result.current.isAuthenticated).toBe(true);
    });
    expect(hook.result.current.user?.uid).toBe(VALID_OIDC_USER.profile.sub);
  });
});
