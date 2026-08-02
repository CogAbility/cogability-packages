/**
 * AuthProvider – persistSession tests
 *
 * `@cogability/sdk` is mocked so we can capture the exact arguments passed to
 * the `AuthClient` constructor. The mock also stubs a `CmgClient` with enough
 * surface (checkGeofence) for the anonymous geofence probe that AuthProvider
 * runs in a useEffect on mount to resolve without crashing the render.
 *
 * Kept narrowly focused on: does AuthClient get constructed with the right
 * `persistSession` value, by default and when overridden via the prop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { AuthProvider } from './AuthProvider.jsx';
import { AuthClient, CmgClient } from '@cogability/sdk';

vi.mock('@cogability/sdk', () => {
  const AuthClient = vi.fn(function AuthClient(options) {
    this.options = options;
    this.getUser = vi.fn(async () => null);
    this.login = vi.fn(async () => {});
    this.handleCallback = vi.fn(async () => ({ user: null, idToken: null, accessToken: null }));
    this.logout = vi.fn(async () => {});
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
    this.redeemCode = vi.fn(async () => ({
      isMember: false,
      autoProvisioned: false,
      roles: [],
      geofenced: false,
      geofenceMessage: null,
      codeRequired: false,
      error: null,
      message: null,
    }));
  });
  return { AuthClient, CmgClient };
});

describe('AuthProvider – persistSession', () => {
  beforeEach(() => {
    AuthClient.mockClear();
    CmgClient.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('constructs AuthClient with persistSession: true when the prop is not supplied', async () => {
    await act(async () => {
      render(<AuthProvider><div /></AuthProvider>);
    });

    expect(AuthClient).toHaveBeenCalledTimes(1);
    expect(AuthClient.mock.calls[0][0]).toMatchObject({ persistSession: true });
  });

  it('constructs AuthClient with persistSession: false when persistSession={false} is passed', async () => {
    await act(async () => {
      render(<AuthProvider persistSession={false}><div /></AuthProvider>);
    });

    expect(AuthClient).toHaveBeenCalledTimes(1);
    expect(AuthClient.mock.calls[0][0]).toMatchObject({ persistSession: false });
  });
});
