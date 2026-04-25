/**
 * Session store adapters.
 *
 * CamClient and AuthClient use a SessionStore interface to persist session
 * identifiers (uid, cogbot_sid, tokens) without depending on browser globals.
 * Swap implementations to move between browser, Node.js, and test environments.
 *
 * @implements {import('./types.js').SessionStore}
 */

/**
 * In-memory store — default for Node.js agents and server-side usage.
 * State is scoped to the CamClient instance lifetime.
 */
export class MemorySessionStore {
  constructor() {
    this._store = new Map();
  }

  /** @param {string} key */
  get(key) {
    return this._store.has(key) ? this._store.get(key) : null;
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    this._store.set(key, value);
  }

  /** @param {string} key */
  remove(key) {
    this._store.delete(key);
  }

  /** Returns a plain-object snapshot of all stored keys (useful for debugging). */
  snapshot() {
    return Object.fromEntries(this._store);
  }
}

/**
 * Browser sessionStorage adapter — use in browser/SPA contexts.
 * Mirrors the original buddyApi.js / AuthProvider sessionStorage usage.
 */
export class BrowserSessionStore {
  /** @param {string} key */
  get(key) {
    return sessionStorage.getItem(key);
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    sessionStorage.setItem(key, value);
  }

  /** @param {string} key */
  remove(key) {
    sessionStorage.removeItem(key);
  }
}
