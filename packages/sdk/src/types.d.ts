/**
 * @cogability/sdk — TypeScript type declarations.
 * Mirrors the JSDoc @typedef definitions in types.js.
 */

export interface CamClientOptions {
  /** Base URL of the CAM service (e.g. "https://cam.example.com"). Leave empty in browser dev to use the Vite proxy (/cogbot-api). */
  host?: string;
  /** The cogbot identifier (e.g. "mc_0091:full"). */
  cogbotId: string;
  /** BCP 47 language tag. Defaults to "en-US". */
  language?: string;
  /** ISO 3166-1 alpha-2 country code. Defaults to "US". */
  country?: string;
  /** Storage adapter for uid/sid. Defaults to MemorySessionStore. Use BrowserSessionStore in web apps. */
  sessionStore?: SessionStore;
  /** Returns the current page URL for message context. Defaults to window.location.href in browser, empty string in Node.js. */
  getHostUrl?: () => string;
}

export interface CmgClientOptions {
  /** Base URL of the CMG service (e.g. "https://cmg.example.com"). */
  host: string;
  /** Site/cogbot namespace (e.g. "bab"). */
  namespace: string;
}

export interface AuthClientOptions {
  /** App ID OAuth server URL (the OIDC issuer). */
  authorityUrl: string;
  /** App ID client ID. */
  clientId: string;
  /** Full URL of the /callback page. */
  redirectUri: string;
  /** URL of the CMG /auth/token endpoint, used as the OIDC token_endpoint to avoid CORS issues with App ID's direct endpoint. */
  tokenEndpointProxy: string;
}

export interface CogbotSession {
  /** User identifier (UUID, persisted in session store). */
  uid: string;
  /** Cookie-alternative session id, present when the server cannot set a cookie (e.g. Safari ITP in cross-origin contexts). */
  cogbotSid?: string;
}

export interface Role {
  namespace: string;
  name: string;
  display_name?: string;
}

export interface MembershipResult {
  /** True when CMG confirmed namespace membership. */
  isMember: boolean;
  /** True when CMG auto-created membership on this login. */
  autoProvisioned: boolean;
  /** Roles granted to this user in the namespace. */
  roles: Role[];
  /** True when CMG says this IP is outside the allowed region. */
  geofenced: boolean;
  /** Human-readable message when geofenced. */
  geofenceMessage: string | null;
}

export interface GeofenceResult {
  /** True when this IP is outside the allowed region. */
  geofenced: boolean;
  /** Human-readable message when geofenced. */
  message: string | null;
}

export interface SessionStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface SseEvent {
  /** SSE event name (e.g. "partial_object", "object_ready", "final_response"). */
  eventName: string;
  /** Parsed JSON data from the event's data: lines. */
  data: object;
}

export interface MessageResponseGeneric {
  /** e.g. "text", "option", "image". */
  response_type: string;
  text?: string;
}

export interface MessageResponse {
  user_identifier: string;
  request_id: string;
  output: { generic: MessageResponseGeneric[] };
}

export interface ConversationTurn {
  /** "user" or "assistant". */
  role: string;
  content: string;
}

export interface ConversationHistoryResponse {
  /** Fully-qualified PFC2 thread identifier. */
  thread_id: string;
  /** The chat_id that was looked up. */
  chat_id: string;
  /** Ordered list of conversation turns. */
  turns: ConversationTurn[];
  /** Plain-text transcript, or null. */
  transcript_text: string | null;
  /** Optional RAG-generated summary, or null. */
  summary: string | null;
}

export interface ConversationListItem {
  /** Unique identifier for the conversation. */
  chat_id: string;
  /** ISO 8601 timestamp of the last turn. */
  last_updated: string;
  /** Human-readable title, or null if untitled. */
  title: string | null;
  /** Number of turns, or null if unknown. */
  turn_count: number | null;
}

export interface ConversationListResponse {
  /** List of the user's prior conversations. */
  conversations: ConversationListItem[];
}

export interface ParentInfo {
  firstName: string;
  lastName: string;
}

export interface ChildInfo {
  name: string;
  gender?: string;
  birthMonth?: string;
  birthDay?: string;
  birthYear?: string;
}

// ---------------------------------------------------------------------------
// Profile schema types (added in v0.5.0)
// ---------------------------------------------------------------------------

export interface ProfileFieldOption {
  /** The value persisted when this option is selected. */
  value?: string;
  /** Human-readable option label. */
  label?: string;
}

export interface ProfileField {
  /** Field identifier (used as the persisted property name). */
  key?: string;
  /** Human-readable label shown in the form. */
  label?: string;
  /** Input type. Unknown values should degrade to "text" with a console warning. */
  field_type?: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'multiselect' | 'boolean';
  /** Defaults to false. */
  required?: boolean;
  /** Optional helper text shown beneath the input. */
  help_text?: string;
  /** For "select" / "multiselect". */
  options?: ProfileFieldOption[];
  placeholder?: string;
  /** Min for "number" inputs (inclusive). */
  min_value?: number;
  /** Max for "number" inputs (inclusive). */
  max_value?: number;
  /** Regex pattern for "text" validation. */
  pattern?: string;
  /** Small safe expression evaluated against sibling fields to conditionally show this field (e.g. "birthContext == 'premature'"). */
  show_when?: string;
  /** Override label used when this field is rendered into the LLM <profile> prompt block (server-side only; not used by the form). */
  prompt_label?: string;
}

export interface ProfileSection {
  /** Section key; doubles as the property name on the stored profile object (e.g. "parent", "children"). */
  key?: string;
  /** Human-readable section heading. */
  label?: string;
  /** Whether the section holds a single object (e.g. parent) or a repeating list of items (e.g. children). */
  section_type?: 'object' | 'list';
  /** For "list" sections. */
  min_items?: number;
  /** For "list" sections. */
  max_items?: number;
  /** For "list" sections: which field on each item is used as the item's title in the UI (e.g. "name"). */
  item_label_field?: string;
  fields?: ProfileField[];
  permission?: string;
  whitelist_email?: string[];
}

export interface ProfileExtrasBucket {
  /** Property name on the stored profile that collects keys not covered by any section (e.g. "other"). */
  key?: string;
  label?: string;
  /** When true, the server appends the bucket's content to the LLM <profile> block. */
  include_in_prompt?: boolean;
}

export interface ProfileSchema {
  /** Schema version; defaults to 1. */
  version?: number;
  sections?: ProfileSection[];
  extras_bucket?: ProfileExtrasBucket;
}
