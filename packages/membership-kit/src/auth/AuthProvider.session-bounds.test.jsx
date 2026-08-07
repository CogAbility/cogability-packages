/**
 * AuthProvider – session bounds (idle timeout / absolute cap) tests
 *
 * `@cogability/sdk` is mocked the same way `AuthProvider.persist-session.test.jsx`
 * does, so we can inspect exactly what AuthClient was constructed with and
 * drive its `onSessionExpired` callback directly rather than waiting on a
 * real timer or OIDC flow.
 *
 * Covers:
 *   - idleTimeoutMinutes / absoluteCapHours are forwarded to AuthClient, and
 *     left out entirely (so the SDK default applies) when not supplied.
 *   - Calling the captured onSessionExpired('idle') clears the cam_token /
 *     cam_access_token sessionStorage mirror and resets auth state to signed-out.
 *   - sessionExpiredReason is exposed after expiry and cleared by a subsequent
 *     successful sign-in.
 *   - startActivityMonitor() is called once a user is signed in, and its
 *     returned stop function is called on unmount.
 *   - The AuthClient instance is not recreated by unrelated re-renders (e.g.
 *     signing in), which would otherwise tear down and restart the monitor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider.jsx';
import { AuthClient, CmgClient } from '@cogability/sdk';

const FAKE_USER = {
  uid: 'user-1',
  email: 'member@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  idToken: 'fake-id-token',
  accessToken: 'fake-access-token',
  raw: {},
};

vi.mock('@cogability/sdk', () => {
  const AuthClient = vi.fn(function AuthClient(options) {
    this.options = options;
    this._stop = vi.fn();
    this.getUser = vi.fn(async () => null);
    this.login = vi.fn(async () => {});
    this.handleCallback = vi.fn(async () => ({
      user: FAKE_USER,
      idToken: FAKE_USER.idToken,
      accessToken: FAKE_USER.accessToken,
    }));
    this.logout = vi.fn(async () => {});
    this.startActivityMonitor = vi.fn(() => this._stop);
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

describe('AuthProvider – session bounds', () => {
  beforeEach(() => {
    AuthClient.mockClear();
    CmgClient.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('forwards idleTimeoutMinutes and absoluteCapHours to AuthClient when supplied', async () => {
    await act(async () => {
      renderHook(() => useAuth(), {
        wrapper: makeWrapper({ idleTimeoutMinutes: 15, absoluteCapHours: 6 }),
      });
    });

    expect(AuthClient).toHaveBeenCalledTimes(1);
    expect(AuthClient.mock.calls[0][0]).toMatchObject({
      idleTimeoutMinutes: 15,
      absoluteCapHours: 6,
    });
  });

  it('leaves idleTimeoutMinutes and absoluteCapHours unset (SDK default) when not supplied', async () => {
    await act(async () => {
      renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });

    expect(AuthClient).toHaveBeenCalledTimes(1);
    expect(AuthClient.mock.calls[0][0].idleTimeoutMinutes).toBeUndefined();
    expect(AuthClient.mock.calls[0][0].absoluteCapHours).toBeUndefined();
  });

  it("onSessionExpired('idle') clears the sessionStorage token mirror and resets auth state", async () => {
    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });

    // Sign in first, so there is something for the expiry to tear down.
    await act(async () => {
      await hook.result.current.handleCallback();
    });
    expect(hook.result.current.isAuthenticated).toBe(true);
    expect(sessionStorage.getItem('cam_token')).toBe(FAKE_USER.idToken);
    expect(sessionStorage.getItem('cam_access_token')).toBe(FAKE_USER.accessToken);

    const authInstance = AuthClient.mock.instances[0];
    const onSessionExpired = authInstance.options.onSessionExpired;

    act(() => {
      onSessionExpired('idle');
    });

    expect(sessionStorage.getItem('cam_token')).toBeNull();
    expect(sessionStorage.getItem('cam_access_token')).toBeNull();
    expect(hook.result.current.user).toBeNull();
    expect(hook.result.current.isAuthenticated).toBe(false);
    expect(hook.result.current.isMember).toBe(false);
    expect(hook.result.current.membershipStatus).toBe('none');
  });

  it("exposes sessionExpiredReason after expiry and clears it on a fresh successful sign-in", async () => {
    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });

    await act(async () => {
      await hook.result.current.handleCallback();
    });

    const authInstance = AuthClient.mock.instances[0];

    act(() => {
      authInstance.options.onSessionExpired('absolute');
    });
    expect(hook.result.current.sessionExpiredReason).toBe('absolute');

    await act(async () => {
      await hook.result.current.handleCallback();
    });
    expect(hook.result.current.sessionExpiredReason).toBeNull();
    expect(hook.result.current.isAuthenticated).toBe(true);
  });

  it('starts the activity monitor once a user is signed in, and stops it on unmount', async () => {
    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });

    const authInstance = AuthClient.mock.instances[0];
    expect(authInstance.startActivityMonitor).not.toHaveBeenCalled();

    await act(async () => {
      await hook.result.current.handleCallback();
    });
    expect(authInstance.startActivityMonitor).toHaveBeenCalledTimes(1);
    expect(authInstance._stop).not.toHaveBeenCalled();

    hook.unmount();
    expect(authInstance._stop).toHaveBeenCalledTimes(1);
  });

  it('does not recreate the AuthClient instance across unrelated re-renders (sign-in)', async () => {
    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });

    expect(AuthClient).toHaveBeenCalledTimes(1);

    await act(async () => {
      await hook.result.current.handleCallback();
    });

    // Signing in changes several pieces of React state (user, membership,
    // etc.) but must not have rebuilt the memoized AuthClient — doing so
    // would tear down and restart the activity monitor for no reason.
    expect(AuthClient).toHaveBeenCalledTimes(1);
    expect(AuthClient.mock.instances).toHaveLength(1);
  });
});
