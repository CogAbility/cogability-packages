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
 *
 * Scoped to one tab: closing it discards the session. For an anonymous visitor
 * that means a fresh uid, and therefore a fresh turn allowance — see
 * PersistentBrowserSessionStore below.
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

/** Reads a storage area, tolerating environments where access itself throws. */
function safeStorage(area) {
  if (typeof window === 'undefined') return null;
  try {
    return window[area] ?? null;
  } catch {
    // Safari private mode and hardened/embedded browsers throw on access.
    return null;
  }
}

function readItem(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns whether the write actually landed — callers rely on this before dropping a fallback copy. */
function writeItem(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function dropItem(storage, key) {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Nothing useful to do; the value is already unreachable to us.
  }
}

/**
 * Browser localStorage adapter — survives tab closes and browser restarts.
 *
 * Prefer this over BrowserSessionStore for CamClient in any site with an
 * anonymous turn limit: with a tab-scoped store, closing the tab hands the
 * visitor a new uid and a full turn allowance again.
 *
 * Reads migrate transparently from sessionStorage, so a site can switch to this
 * store without stranding visitors mid-session or writing its own migration.
 *
 * @implements {import('./types.js').SessionStore}
 */
export class PersistentBrowserSessionStore {
  /** @param {string} key */
  get(key) {
    const local = safeStorage('localStorage');
    const session = safeStorage('sessionStorage');

    const durable = local ? readItem(local, key) : null;
    if (durable !== null) {
      dropItem(session, key);
      return durable;
    }

    const legacy = session ? readItem(session, key) : null;
    if (legacy === null) return null;

    // Only discard the tab-scoped copy once the durable write succeeds,
    // otherwise a quota or private-mode failure would lose the id outright.
    if (local && writeItem(local, key, legacy)) dropItem(session, key);
    return legacy;
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    const local = safeStorage('localStorage');
    if (local && writeItem(local, key, value)) {
      dropItem(safeStorage('sessionStorage'), key);
      return;
    }

    // No durable storage available. Degrade to tab-scoped rather than dropping
    // the value, which keeps this visit working exactly like BrowserSessionStore.
    const session = safeStorage('sessionStorage');
    if (session) writeItem(session, key, value);
  }

  /** @param {string} key */
  remove(key) {
    dropItem(safeStorage('localStorage'), key);
    dropItem(safeStorage('sessionStorage'), key);
  }
}
