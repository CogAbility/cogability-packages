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

describe('AuthClient – persistSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to persistSession: false and does not use localStorage as the userStore', async () => {
    const fakeWindow = makeFakeWindow();
    vi.stubGlobal('window', fakeWindow);

    const auth = new AuthClient(BASE_OPTIONS);
    const manager = await auth._getManager();

    expect(manager.settings.userStore._store).not.toBe(fakeWindow.localStorage);
    expect(manager.settings.userStore._store).toBe(fakeWindow.sessionStorage);
  });

  it('persistSession: true configures a userStore backed by window.localStorage', async () => {
    const fakeWindow = makeFakeWindow();
    vi.stubGlobal('window', fakeWindow);

    const auth = new AuthClient({ ...BASE_OPTIONS, persistSession: true });
    const manager = await auth._getManager();

    expect(manager.settings.userStore._store).toBe(fakeWindow.localStorage);
  });

  it('persistSession: true falls back to the default store when no usable window exists', async () => {
    const authDefault = new AuthClient(BASE_OPTIONS);
    const authPersist = new AuthClient({ ...BASE_OPTIONS, persistSession: true });

    const managerDefault = await authDefault._getManager();
    const managerPersist = await authPersist._getManager();

    expect(managerPersist.settings.userStore._store.constructor).toBe(
      managerDefault.settings.userStore._store.constructor
    );
  });
});
