/**
 * PersistentBrowserSessionStore tests
 *
 * The `sdk` vitest project runs in the `node` environment (no real `window`),
 * so — like auth-client.persist-session.test.js — we stub `window` with fake
 * Map-backed storage objects via vi.stubGlobal rather than relying on jsdom.
 *
 * Coverage:
 * 1. get() prefers localStorage and drops a stale sessionStorage copy.
 * 2. get() migrates a sessionStorage-only value into localStorage.
 * 3. Migration only drops the sessionStorage copy if the localStorage write
 *    actually succeeds — the most important behavior to lock down.
 * 4. set() writes to localStorage and clears any sessionStorage copy, or
 *    degrades to sessionStorage if the localStorage write throws.
 * 5. remove() clears both storage areas.
 * 6. Every storage interaction (area access, getItem, setItem, removeItem)
 *    is tolerated when it throws — never propagates to the caller.
 * 7. When window is undefined (SSR), get() returns null and set()/remove()
 *    are no-ops that don't throw.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { PersistentBrowserSessionStore } from './session-store.js';

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

function makeFakeWindow() {
  return { localStorage: makeFakeStorage(), sessionStorage: makeFakeStorage() };
}

describe('PersistentBrowserSessionStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('get returns the localStorage value and drops a stale sessionStorage copy', () => {
    const fakeWindow = makeFakeWindow();
    fakeWindow.localStorage.setItem('uid', 'from-local');
    fakeWindow.sessionStorage.setItem('uid', 'stale-from-session');
    vi.stubGlobal('window', fakeWindow);

    const store = new PersistentBrowserSessionStore();

    expect(store.get('uid')).toBe('from-local');
    expect(fakeWindow.sessionStorage.getItem('uid')).toBeNull();
  });

  it('get migrates a sessionStorage-only value into localStorage', () => {
    const fakeWindow = makeFakeWindow();
    fakeWindow.sessionStorage.setItem('uid', 'legacy-value');
    vi.stubGlobal('window', fakeWindow);

    const store = new PersistentBrowserSessionStore();
    const result = store.get('uid');

    expect(result).toBe('legacy-value');
    expect(fakeWindow.localStorage.getItem('uid')).toBe('legacy-value');
    expect(fakeWindow.sessionStorage.getItem('uid')).toBeNull();
  });

  it('get returns null when neither storage area has the key', () => {
    const fakeWindow = makeFakeWindow();
    vi.stubGlobal('window', fakeWindow);

    const store = new PersistentBrowserSessionStore();

    expect(store.get('missing')).toBeNull();
  });

  it('CRITICAL: preserves the sessionStorage copy when the localStorage write fails during migration', () => {
    const fakeWindow = makeFakeWindow();
    fakeWindow.sessionStorage.setItem('uid', 'legacy-value');
    vi.stubGlobal('window', fakeWindow);
    vi.spyOn(fakeWindow.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const store = new PersistentBrowserSessionStore();
    const result = store.get('uid');

    // The value must still be returned even though the durable write failed.
    expect(result).toBe('legacy-value');
    // The localStorage write never landed.
    expect(fakeWindow.localStorage.getItem('uid')).toBeNull();
    // Crucially, the sessionStorage fallback copy must NOT have been dropped,
    // otherwise the value would be lost on the next read.
    expect(fakeWindow.sessionStorage.getItem('uid')).toBe('legacy-value');
  });

  it('set writes to localStorage and clears any sessionStorage copy', () => {
    const fakeWindow = makeFakeWindow();
    fakeWindow.sessionStorage.setItem('uid', 'old-tab-scoped');
    vi.stubGlobal('window', fakeWindow);

    const store = new PersistentBrowserSessionStore();
    store.set('uid', 'new-value');

    expect(fakeWindow.localStorage.getItem('uid')).toBe('new-value');
    expect(fakeWindow.sessionStorage.getItem('uid')).toBeNull();
  });

  it('set degrades to sessionStorage when the localStorage write throws', () => {
    const fakeWindow = makeFakeWindow();
    vi.stubGlobal('window', fakeWindow);
    vi.spyOn(fakeWindow.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const store = new PersistentBrowserSessionStore();
    store.set('uid', 'fallback-value');

    expect(fakeWindow.localStorage.getItem('uid')).toBeNull();
    expect(fakeWindow.sessionStorage.getItem('uid')).toBe('fallback-value');
  });

  it('remove clears both storage areas', () => {
    const fakeWindow = makeFakeWindow();
    fakeWindow.localStorage.setItem('uid', 'a');
    fakeWindow.sessionStorage.setItem('uid', 'b');
    vi.stubGlobal('window', fakeWindow);

    const store = new PersistentBrowserSessionStore();
    store.remove('uid');

    expect(fakeWindow.localStorage.getItem('uid')).toBeNull();
    expect(fakeWindow.sessionStorage.getItem('uid')).toBeNull();
  });

  it('tolerates window.localStorage itself throwing on access, falling back to sessionStorage', () => {
    const fakeWindow = { sessionStorage: makeFakeStorage() };
    Object.defineProperty(fakeWindow, 'localStorage', {
      get() { throw new Error('SecurityError: localStorage access blocked'); },
    });
    fakeWindow.sessionStorage.setItem('uid', 'legacy-value');
    vi.stubGlobal('window', fakeWindow);

    const store = new PersistentBrowserSessionStore();

    expect(store.get('uid')).toBe('legacy-value');
    // No durable storage was reachable, so the tab-scoped copy must survive.
    expect(fakeWindow.sessionStorage.getItem('uid')).toBe('legacy-value');
  });

  it('tolerates window.sessionStorage itself throwing on access', () => {
    const fakeWindow = { localStorage: makeFakeStorage() };
    Object.defineProperty(fakeWindow, 'sessionStorage', {
      get() { throw new Error('SecurityError: sessionStorage access blocked'); },
    });
    fakeWindow.localStorage.setItem('uid', 'from-local');
    vi.stubGlobal('window', fakeWindow);

    const store = new PersistentBrowserSessionStore();

    expect(store.get('uid')).toBe('from-local');
  });

  it('get returns null (not throw) when getItem throws on both storage areas', () => {
    const fakeWindow = makeFakeWindow();
    vi.stubGlobal('window', fakeWindow);
    vi.spyOn(fakeWindow.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('boom');
    });
    vi.spyOn(fakeWindow.sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('boom');
    });

    const store = new PersistentBrowserSessionStore();

    expect(() => store.get('uid')).not.toThrow();
    expect(store.get('uid')).toBeNull();
  });

  it('set does not throw when both storage areas throw on write', () => {
    const fakeWindow = makeFakeWindow();
    vi.stubGlobal('window', fakeWindow);
    vi.spyOn(fakeWindow.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('boom');
    });
    vi.spyOn(fakeWindow.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('boom');
    });

    const store = new PersistentBrowserSessionStore();

    expect(() => store.set('uid', 'value')).not.toThrow();
  });

  it('remove does not throw when removeItem throws on both storage areas', () => {
    const fakeWindow = makeFakeWindow();
    vi.stubGlobal('window', fakeWindow);
    vi.spyOn(fakeWindow.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('boom');
    });
    vi.spyOn(fakeWindow.sessionStorage, 'removeItem').mockImplementation(() => {
      throw new Error('boom');
    });

    const store = new PersistentBrowserSessionStore();

    expect(() => store.remove('uid')).not.toThrow();
  });

  it('SSR: get returns null and set/remove are no-ops when window is undefined', () => {
    vi.stubGlobal('window', undefined);

    const store = new PersistentBrowserSessionStore();

    expect(store.get('uid')).toBeNull();
    expect(() => store.set('uid', 'value')).not.toThrow();
    expect(() => store.remove('uid')).not.toThrow();
  });
});
