/**
 * @cogability/sdk — shared JSDoc type definitions.
 * This file contains no runtime code; it is imported for type annotations only.
 */

/**
 * @typedef {Object} CamClientOptions
 * @property {string} [host] - Base URL of the CAM service (e.g. "https://cam.example.com").
 *   In browser dev, leave empty to use the Vite proxy (/cogbot-api).
 * @property {string} cogbotId - The cogbot identifier (e.g. "mc_0091:full").
 * @property {string} [language] - BCP 47 language tag. Defaults to "en-US".
 * @property {string} [country] - ISO 3166-1 alpha-2 country code. Defaults to "US".
 * @property {SessionStore} [sessionStore] - Storage adapter for uid/sid.
 *   Defaults to MemorySessionStore. Use BrowserSessionStore in web apps.
 * @property {() => string} [getHostUrl] - Returns the current page URL for message context.
 *   Defaults to window.location.href in browser, empty string in Node.js.
 */

/**
 * @typedef {Object} CmgClientOptions
 * @property {string} host - Base URL of the CMG service (e.g. "https://cmg.example.com").
 * @property {string} namespace - Site/cogbot namespace (e.g. "bab").
 */

/**
 * @typedef {Object} AuthClientOptions
 * @property {string} authorityUrl - App ID OAuth server URL (the OIDC issuer).
 * @property {string} clientId - App ID client ID.
 * @property {string} redirectUri - Full URL of the /callback page.
 * @property {string} tokenEndpointProxy - URL of the CMG /auth/token endpoint,
 *   used as the OIDC token_endpoint to avoid CORS issues with App ID's direct endpoint.
 */

/**
 * @typedef {Object} CogbotSession
 * @property {string} uid - User identifier (UUID, persisted in session store).
 * @property {string} [cogbotSid] - Cookie-alternative session id, present when
 *   the server cannot set a cookie (e.g. Safari ITP in cross-origin contexts).
 */

/**
 * @typedef {Object} MembershipResult
 * @property {boolean} isMember - True when CMG confirmed namespace membership.
 * @property {boolean} autoProvisioned - True when CMG auto-created membership on this login.
 * @property {Role[]} roles - Roles granted to this user in the namespace.
 * @property {boolean} geofenced - True when CMG says this IP is outside the allowed region.
 * @property {string|null} geofenceMessage - Human-readable message when geofenced.
 */

/**
 * @typedef {Object} GeofenceResult
 * @property {boolean} geofenced - True when this IP is outside the allowed region.
 * @property {string|null} message - Human-readable message when geofenced.
 */

/**
 * @typedef {Object} Role
 * @property {string} namespace
 * @property {string} name
 * @property {string} [display_name]
 */

/**
 * @typedef {Object} SseEvent
 * @property {string} eventName - SSE event name (e.g. "partial_object", "object_ready", "final_response").
 * @property {Object} data - Parsed JSON data from the event's data: lines.
 */

/**
 * @typedef {Object} MessageResponseGeneric
 * @property {string} response_type - e.g. "text", "option", "image".
 * @property {string} [text]
 */

/**
 * @typedef {Object} MessageResponse
 * @property {string} user_identifier
 * @property {string} request_id
 * @property {{ generic: MessageResponseGeneric[] }} output
 */

/**
 * @typedef {Object} ParentInfo
 * @property {string} firstName
 * @property {string} lastName
 */

/**
 * @typedef {Object} ChildInfo
 * @property {string} name
 * @property {string} [gender]
 * @property {string} [birthMonth]
 * @property {string} [birthDay]
 * @property {string} [birthYear]
 */

/**
 * @typedef {Object} SessionStore
 * @property {(key: string) => string|null} get
 * @property {(key: string, value: string) => void} set
 * @property {(key: string) => void} remove
 */

/**
 * @typedef {Object} ConversationTurn
 * @property {string} role - "user" or "assistant".
 * @property {string} content
 */

/**
 * @typedef {Object} ConversationHistoryResponse
 * @property {string} thread_id - Fully-qualified PFC2 thread identifier.
 * @property {string} chat_id - The chat_id that was looked up.
 * @property {ConversationTurn[]} turns - Ordered list of conversation turns.
 * @property {string|null} transcript_text - Plain-text transcript, or null.
 * @property {string|null} summary - Optional RAG-generated summary, or null.
 */

/**
 * @typedef {Object} ConversationListItem
 * @property {string} chat_id - Unique identifier for the conversation.
 * @property {string} last_updated - ISO 8601 timestamp of the last turn.
 * @property {string|null} title - Human-readable title, or null if untitled.
 * @property {number|null} turn_count - Number of turns, or null if unknown.
 */

/**
 * @typedef {Object} ConversationListResponse
 * @property {ConversationListItem[]} conversations - List of the user's prior conversations.
 */

/**
 * @typedef {Object} ProfileFieldOption
 * @property {string} [value] - The value persisted when this option is selected.
 * @property {string} [label] - Human-readable option label.
 */

/**
 * @typedef {Object} ProfileField
 * @property {string} [key] - Field identifier (used as the persisted property name).
 * @property {string} [label] - Human-readable label shown in the form.
 * @property {('text'|'textarea'|'date'|'number'|'select'|'multiselect'|'boolean')} [field_type] -
 *   Input type. Unknown values should degrade to ``text`` with a console warning.
 * @property {boolean} [required] - Defaults to false.
 * @property {string} [help_text] - Optional helper text shown beneath the input.
 * @property {ProfileFieldOption[]} [options] - For ``select`` / ``multiselect``.
 * @property {string} [placeholder]
 * @property {number} [min_value] - Min for ``number`` inputs (inclusive).
 * @property {number} [max_value] - Max for ``number`` inputs (inclusive).
 * @property {string} [pattern] - Regex pattern for ``text`` validation.
 * @property {string} [show_when] - Small safe expression evaluated against
 *   sibling fields to conditionally show this field (e.g. ``"birthContext == 'premature'"``).
 * @property {string} [prompt_label] - Override label used when this field is
 *   rendered into the LLM ``<profile>`` prompt block (server-side only; not used by the form).
 */

/**
 * @typedef {Object} ProfileSection
 * @property {string} [key] - Section key; doubles as the property name on the
 *   stored profile object (e.g. ``"parent"``, ``"children"``).
 * @property {string} [label] - Human-readable section heading.
 * @property {('object'|'list')} [section_type] - Whether the section holds a
 *   single object (e.g. parent) or a repeating list of items (e.g. children).
 * @property {number} [min_items] - For ``list`` sections.
 * @property {number} [max_items] - For ``list`` sections.
 * @property {string} [item_label_field] - For ``list`` sections: which field
 *   on each item is used as the item's title in the UI (e.g. ``"name"``).
 * @property {ProfileField[]} [fields]
 * @property {string} [permission]
 * @property {string[]} [whitelist_email]
 */

/**
 * @typedef {Object} ProfileExtrasBucket
 * @property {string} [key] - Property name on the stored profile that collects
 *   keys not covered by any section (e.g. ``"other"``).
 * @property {string} [label]
 * @property {boolean} [include_in_prompt] - When true, the server appends the
 *   bucket's content to the LLM ``<profile>`` block. UI-only fields do not
 *   need to use this flag.
 */

/**
 * @typedef {Object} ProfileSchema
 * @property {number} [version] - Schema version; defaults to 1.
 * @property {ProfileSection[]} [sections]
 * @property {ProfileExtrasBucket} [extras_bucket]
 */

export {};
