/**
 * AuthProvider – SDK version-skew guard tests
 *
 * `@cogability/sdk` is mocked the same way the sibling AuthProvider test files
 * do, but here the mock instance's `startActivityMonitor` is conditionally
 * omitted altogether (rather than stubbed) to reproduce the exact production
 * incident: kit 0.9.0 paired with an sdk that predates the activity monitor,
 * where `auth.startActivityMonitor` is `undefined` and calling it throws
 * `TypeError: auth.startActivityMonitor is not a function` inside a useEffect
 * with no error boundary above it. `sdkBehavior` is mutable so each test can
 * choose whether the constructed instance exposes the method at all, and what
 * it returns, without needing per-test module resets.
 *
 * Covers:
 *   - A signed-in user against an SDK missing startActivityMonitor entirely
 *     does not throw, renders children, and still reports isAuthenticated.
 *   - That same case logs exactly one console.warn naming the cause
 *     (SDK too old) and the consequence (idle logoff falls back to the next
 *     token read).
 *   - A signed-in user against a healthy SDK still calls startActivityMonitor
 *     exactly once and calls the returned stop on unmount — proving the guard
 *     does not regress the working path.
 *   - A defensive SDK whose startActivityMonitor returns undefined instead of
 *     a stop function unmounts cleanly without throwing.
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

// Mutable per-test so the mocked AuthClient instance can either omit
// startActivityMonitor (old SDK), expose a healthy one, or expose one that
// returns undefined (defensive SDK) — without needing per-test module resets.
const sdkBehavior = {
  hasActivityMonitor: true,
  stopImpl: () => vi.fn(),
};

vi.mock('@cogability/sdk', () => {
  const AuthClient = vi.fn(function AuthClient(options) {
    this.options = options;
    this.getUser = vi.fn(async () => null);
    this.login = vi.fn(async () => {});
    this.handleCallback = vi.fn(async () => ({
      user: FAKE_USER,
      idToken: FAKE_USER.idToken,
      accessToken: FAKE_USER.accessToken,
    }));
    this.logout = vi.fn(async () => {});
    if (sdkBehavior.hasActivityMonitor) {
      this.startActivityMonitor = vi.fn(() => sdkBehavior.stopImpl());
    }
    // No startActivityMonitor property at all when hasActivityMonitor is
    // false — reproducing an sdk build that predates the method, rather than
    // one that stubs it out to a no-op.
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

describe('AuthProvider – SDK version-skew guard', () => {
  beforeEach(() => {
    AuthClient.mockClear();
    CmgClient.mockClear();
    sessionStorage.clear();
    sdkBehavior.hasActivityMonitor = true;
    sdkBehavior.stopImpl = () => vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not throw and still renders an authenticated user when startActivityMonitor is absent from the SDK', async () => {
    sdkBehavior.hasActivityMonitor = false;

    let hook;
    let renderError = null;
    try {
      await act(async () => {
        hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
      });
      await act(async () => {
        await hook.result.current.handleCallback();
      });
    } catch (err) {
      renderError = err;
    }

    expect(renderError).toBeNull();
    expect(hook.result.current.isAuthenticated).toBe(true);
    expect(hook.result.current.user?.uid).toBe(FAKE_USER.uid);
  });

  it('warns exactly once that idle logoff will only happen on the next token read when startActivityMonitor is missing', async () => {
    sdkBehavior.hasActivityMonitor = false;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });
    await act(async () => {
      await hook.result.current.handleCallback();
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0];
    expect(message).toMatch(/startActivityMonitor/);
    expect(message).toMatch(/next token read/);

    warnSpy.mockRestore();
  });

  it('still starts the activity monitor exactly once and stops it on unmount when the SDK is healthy', async () => {
    const stop = vi.fn();
    sdkBehavior.hasActivityMonitor = true;
    sdkBehavior.stopImpl = () => stop;

    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });
    await act(async () => {
      await hook.result.current.handleCallback();
    });

    const authInstance = AuthClient.mock.instances[0];
    expect(authInstance.startActivityMonitor).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();

    hook.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('unmounts cleanly without throwing when startActivityMonitor returns undefined instead of a stop function', async () => {
    sdkBehavior.hasActivityMonitor = true;
    sdkBehavior.stopImpl = () => undefined;

    let hook;
    await act(async () => {
      hook = renderHook(() => useAuth(), { wrapper: makeWrapper({}) });
    });
    await act(async () => {
      await hook.result.current.handleCallback();
    });

    expect(() => hook.unmount()).not.toThrow();
  });
});
