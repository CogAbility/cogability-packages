import { describe, it, expect, afterEach, vi } from 'vitest';
import { AuthClient } from './auth-client.js';

const AUTHORITY = 'https://appid.example.com/oauth/v4/tenant-id';

const BASE_OPTIONS = {
  authorityUrl: AUTHORITY,
  clientId: 'babybrain-spa-client',
  redirectUri: 'https://babybrain.ai/callback',
  tokenEndpointProxy: 'https://cmg.example.com/auth/token',
};

function base64url(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A structurally valid JWT. Never signed — nothing under test verifies it. */
function makeIdToken(claims = {}) {
  const payload = {
    iss: AUTHORITY,
    // The broker's own confidential client, deliberately NOT the SPA's.
    aud: 'idbroker-confidential-client',
    sub: 'ms_9188040d-6c67-4c5b-b112-36a304b66dad_user-object-id',
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'parent@example.com',
    given_name: 'A',
    family_name: 'Parent',
    name: 'A Parent',
    ...claims,
  };
  return `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url(payload)}.signature-not-checked`;
}

function brokerTokens(overrides = {}) {
  return {
    id_token: makeIdToken(),
    access_token: 'appid-access-token',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'openid profile email',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthClient – signInWithExternalTokens', () => {
  it('stores the tokens so getUser() returns the session', async () => {
    const auth = new AuthClient(BASE_OPTIONS);
    await auth.signInWithExternalTokens(brokerTokens());

    const user = await auth.getUser();
    expect(user).not.toBeNull();
    expect(user.access_token).toBe('appid-access-token');
    expect(await auth.getIdToken()).toBeTruthy();
  });

  it('returns the same shape as handleCallback()', async () => {
    const auth = new AuthClient(BASE_OPTIONS);
    const result = await auth.signInWithExternalTokens(brokerTokens());

    expect(result.user.uid).toBe('ms_9188040d-6c67-4c5b-b112-36a304b66dad_user-object-id');
    expect(result.user.email).toBe('parent@example.com');
    expect(result.user.firstName).toBe('A');
    expect(result.user.lastName).toBe('Parent');
    expect(result.accessToken).toBe('appid-access-token');
  });

  it('accepts a token whose aud is the broker, not this SPA client', async () => {
    // Broker-issued tokens carry the broker's confidential client id. If this
    // ever starts throwing, Microsoft sign-in is broken fleet-wide.
    const auth = new AuthClient(BASE_OPTIONS);
    const result = await auth.signInWithExternalTokens(
      brokerTokens({ id_token: makeIdToken({ aud: 'some-other-client' }) })
    );
    expect(result.user.uid).toBeTruthy();
  });

  it('rejects a token from a different issuer', async () => {
    const auth = new AuthClient(BASE_OPTIONS);
    await expect(
      auth.signInWithExternalTokens(
        brokerTokens({ id_token: makeIdToken({ iss: 'https://evil.example.com/oauth/v4/other' }) })
      )
    ).rejects.toThrow(/issued by https:\/\/evil\.example\.com/);
  });

  it('rejects an already-expired token', async () => {
    const auth = new AuthClient(BASE_OPTIONS);
    await expect(
      auth.signInWithExternalTokens(
        brokerTokens({ id_token: makeIdToken({ exp: Math.floor(Date.now() / 1000) - 60 }) })
      )
    ).rejects.toThrow(/already expired/);
  });

  it('rejects a token with no sub', async () => {
    const auth = new AuthClient(BASE_OPTIONS);
    const { sub: _dropped, ...rest } = {
      sub: 'x',
      iss: AUTHORITY,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    await expect(
      auth.signInWithExternalTokens({
        id_token: `${base64url({ alg: 'RS256' })}.${base64url(rest)}.sig`,
        access_token: 'a',
      })
    ).rejects.toThrow(/no sub claim/);
  });

  it('rejects a malformed id_token rather than storing a broken session', async () => {
    const auth = new AuthClient(BASE_OPTIONS);
    await expect(
      auth.signInWithExternalTokens({ id_token: 'not-a-jwt', access_token: 'a' })
    ).rejects.toThrow(/well-formed JWT/);
    expect(await auth.getUser()).toBeNull();
  });

  it('requires both tokens', async () => {
    const auth = new AuthClient(BASE_OPTIONS);
    await expect(auth.signInWithExternalTokens({ access_token: 'a' })).rejects.toThrow(/id_token/);
    await expect(
      auth.signInWithExternalTokens({ id_token: makeIdToken() })
    ).rejects.toThrow(/access_token/);
  });

  it('decodes non-ASCII names correctly', async () => {
    const auth = new AuthClient(BASE_OPTIONS);
    const result = await auth.signInWithExternalTokens(
      brokerTokens({
        id_token: makeIdToken({ given_name: 'José', family_name: 'Müller-Ávila' }),
      })
    );
    expect(result.user.firstName).toBe('José');
    expect(result.user.lastName).toBe('Müller-Ávila');
  });

  it('leaves the session unset when no refresh token is supplied', async () => {
    // The broker deliberately withholds it, so the session must simply end at
    // the access token's expiry rather than attempt a doomed silent renew.
    const auth = new AuthClient(BASE_OPTIONS);
    await auth.signInWithExternalTokens(brokerTokens());
    const user = await auth.getUser();
    expect(user.refresh_token).toBeUndefined();
  });

  it('logout() clears an externally-seeded session', async () => {
    const auth = new AuthClient(BASE_OPTIONS);
    await auth.signInWithExternalTokens(brokerTokens());
    expect(await auth.getUser()).not.toBeNull();

    await auth.logout();
    expect(await auth.getUser()).toBeNull();
  });
});
