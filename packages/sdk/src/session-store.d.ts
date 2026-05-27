import type { SessionStore } from './types.js';

/**
 * In-memory store — default for Node.js agents and server-side usage.
 * State is scoped to the CamClient instance lifetime.
 */
export class MemorySessionStore implements SessionStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  /** Returns a plain-object snapshot of all stored keys (useful for debugging). */
  snapshot(): Record<string, string>;
}

/**
 * Browser sessionStorage adapter — use in browser/SPA contexts.
 */
export class BrowserSessionStore implements SessionStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
