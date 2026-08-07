/**
 * Session bounds — the browser half of the fleet's session-lifetime rules.
 *
 * Two independent limits, matching what CAM (`app.js`) and CTM
 * (`fe-ctm/session-guards.js`) already enforce server-side:
 *
 *   - an idle timeout (default 30 minutes), refreshed by user activity
 *   - an absolute cap (default 12 hours), fixed at sign-in and never extended
 *
 * Neither is expressible in App ID. Its SSO configuration offers only
 * `isActive`, `inactivityTimeoutSeconds` and `logoutRedirectUris`; `max_age`
 * and `prompt=login` are accepted and ignored, and `prompt=none` is refused
 * outright for confidential clients. So the browser session layer has to own
 * both numbers, which is what this module is.
 *
 * Kept free of oidc-client-ts and of any DOM API beyond a storage handle, so
 * the arithmetic is testable without a browser.
 *
 * One limit worth stating plainly: clearing a session here ends the *local*
 * session. It cannot force a fresh authentication, because App ID will satisfy
 * the next authorization request from its own SSO cookie if that cookie is
 * still inside the tenant's inactivity window. This bounds what a stolen or
 * abandoned browser session is worth; it does not re-prove who is holding it.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Agreed fleet-wide 2026-08-06: HIPAA 164.312(a)(2)(iii) automatic logoff. */
export const DEFAULT_IDLE_MINUTES = 30;
/** Agreed fleet-wide 2026-08-06: CJIS AC-12 session termination. */
export const DEFAULT_ABSOLUTE_HOURS = 12;

/** Returned by `check()` when the idle timeout has elapsed. */
export const IDLE_EXPIRY = 'idle';
/** Returned by `check()` when the absolute cap has been reached. */
export const ABSOLUTE_EXPIRY = 'absolute';

/**
 * Coerce a caller-supplied duration to milliseconds.
 *
 * A non-positive or non-finite value disables that bound, which is the only
 * way to opt out. It has to be deliberate: `undefined` falls through to the
 * default rather than to "off", so forgetting the option leaves you bounded.
 */
function durationMs(value, fallback, unitMs) {
  const raw = value === undefined || value === null ? fallback : value;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * unitMs;
}

/**
 * Tracks when a browser session started and when it was last used.
 *
 * The record lives in the same storage tier as the OIDC session it describes
 * (localStorage when `persistSession` is on, sessionStorage otherwise), so the
 * stamps cannot outlive — or be outlived by — the tokens they bound.
 */
export class SessionBounds {
  /**
   * @param {object} options
   * @param {() => (Storage|null)} options.getStorage - Returns the Web Storage
   *   area holding the OIDC session, or null when storage is unusable.
   * @param {string} options.key - Storage key, namespaced per client id so two
   *   apps sharing an origin do not bound each other's sessions.
   * @param {number} [options.idleTimeoutMinutes=30]
   * @param {number} [options.absoluteCapHours=12]
   */
  constructor({ getStorage, key, idleTimeoutMinutes, absoluteCapHours } = {}) {
    this._getStorage = getStorage;
    this._key = key;
    this._idleMs = durationMs(idleTimeoutMinutes, DEFAULT_IDLE_MINUTES, MINUTE_MS);
    this._absoluteMs = durationMs(absoluteCapHours, DEFAULT_ABSOLUTE_HOURS, HOUR_MS);
  }

  /** True when both bounds are disabled, so callers can skip the work entirely. */
  get disabled() {
    return this._idleMs === null && this._absoluteMs === null;
  }

  get idleTimeoutMs() {
    return this._idleMs;
  }

  get absoluteCapMs() {
    return this._absoluteMs;
  }

  _read() {
    let storage;
    try {
      storage = this._getStorage?.();
    } catch {
      return null;
    }
    if (!storage) return null;

    try {
      const raw = storage.getItem(this._key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const startedAt = Number(parsed?.startedAt);
      const lastActivityAt = Number(parsed?.lastActivityAt);
      if (!Number.isFinite(startedAt) || !Number.isFinite(lastActivityAt)) return null;
      return { startedAt, lastActivityAt };
    } catch {
      // Unreadable or malformed. Treated as absent, which fails closed below.
      return null;
    }
  }

  _write(record) {
    let storage;
    try {
      storage = this._getStorage?.();
    } catch {
      return;
    }
    if (!storage) return;

    try {
      storage.setItem(this._key, JSON.stringify(record));
    } catch {
      // Quota or privacy mode. Nothing useful to do: a session whose stamps
      // cannot be written will fail closed on the next check, which is the
      // safe direction.
    }
  }

  /** Stamp a newly established session. Resets both bounds. */
  start(now = Date.now()) {
    this._write({ startedAt: now, lastActivityAt: now });
  }

  /**
   * True when a readable stamp record exists.
   *
   * Distinct from `check()` on purpose. `check()` answers "may this session
   * continue", and a missing record fails closed there because a stored token
   * is in hand. This answers the narrower "is there a session being tracked at
   * all", which is what a timer needs before it decides to end something.
   */
  hasRecord() {
    return this._read() !== null;
  }

  /**
   * Record activity, restarting the idle clock but never the absolute one.
   *
   * A session with no stamps is not adopted here. Writing a fresh `startedAt`
   * for one would hand an unbounded pre-existing session a brand new 12 hours,
   * which is the exact thing the cap exists to stop.
   */
  touch(now = Date.now()) {
    const record = this._read();
    if (!record) return;
    this._write({ startedAt: record.startedAt, lastActivityAt: now });
  }

  /**
   * @returns {'idle'|'absolute'|null} Which bound has been exceeded, or null
   *   when the session is still within both.
   */
  check(now = Date.now()) {
    if (this.disabled) return null;

    const record = this._read();
    // Fail closed, as CAM and CTM both do. A session with no stamps — one that
    // predates this code, or whose record was cleared out from under it — has
    // no evidence of being inside either bound, and a missing record is
    // exactly what an attacker replaying a lifted token would present.
    if (!record) return ABSOLUTE_EXPIRY;

    if (this._absoluteMs !== null && now - record.startedAt >= this._absoluteMs) {
      return ABSOLUTE_EXPIRY;
    }
    if (this._idleMs !== null && now - record.lastActivityAt >= this._idleMs) {
      return IDLE_EXPIRY;
    }
    return null;
  }

  /** Forget the stamps. Call alongside clearing the session itself. */
  clear() {
    let storage;
    try {
      storage = this._getStorage?.();
    } catch {
      return;
    }
    if (!storage) return;

    try {
      storage.removeItem(this._key);
    } catch {
      // Best-effort.
    }
  }
}
