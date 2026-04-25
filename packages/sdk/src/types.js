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

export {};
