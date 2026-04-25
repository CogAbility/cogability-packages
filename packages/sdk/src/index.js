/**
 * @cogability/sdk
 *
 * Framework-agnostic JavaScript SDK for the CogAbility platform.
 * Works in browser (React, Vue, vanilla JS, Lovable) and Node.js (agents, servers).
 *
 * Three clients, one purpose each:
 *   CamClient  — chat sessions and streaming messages via CAM
 *   CmgClient  — membership validation and geofencing via CMG
 *   AuthClient — browser OIDC login/callback flow via App ID (browser only)
 *
 * Session storage adapters:
 *   BrowserSessionStore — wraps window.sessionStorage (browser)
 *   MemorySessionStore  — in-process Map (Node.js / default)
 *
 * Low-level SSE utilities (re-exported for advanced use):
 *   parseSseBlock  — parse a single SSE block string
 *   parseSseStream — async generator over a fetch Response body
 */

export { CamClient } from './cam-client.js';
export { CmgClient } from './cmg-client.js';
export { AuthClient, createAuthClientFromEnv } from './auth-client.js';
export { BrowserSessionStore, MemorySessionStore } from './session-store.js';
export { parseSseBlock, parseSseStream } from './sse-parser.js';
