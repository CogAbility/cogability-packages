/**
 * @cogability/sdk — TypeScript entry point.
 * Re-exports all public classes, functions, and types.
 */

export { CamClient, CamLimitError } from './cam-client.js';
export { CmgClient } from './cmg-client.js';
export { AuthClient, createAuthClientFromEnv } from './auth-client.js';
export type { AuthUser, AuthCallbackResult } from './auth-client.js';
export { BrowserSessionStore, MemorySessionStore } from './session-store.js';
export { parseSseBlock, parseSseStream } from './sse-parser.js';

export type {
  // Client options
  CamClientOptions,
  CmgClientOptions,
  AuthClientOptions,
  // Session / auth
  CogbotSession,
  SessionStore,
  Role,
  MembershipResult,
  RedeemCodeResult,
  GeofenceResult,
  // Messaging
  SseEvent,
  MessageResponse,
  MessageResponseGeneric,
  ParentInfo,
  ChildInfo,
  // Conversation history
  ConversationTurn,
  ConversationHistoryResponse,
  ConversationListItem,
  ConversationListResponse,
  // Profile schema (v0.5.0+)
  ProfileFieldOption,
  ProfileField,
  ProfileSection,
  ProfileExtrasBucket,
  ProfileSchema,
} from './types.js';
