# @cogability/sdk

Framework-agnostic JavaScript SDK for the CogAbility platform.

Works in **browser** (React, Vue, vanilla JS, Lovable) and **Node.js** (agents, servers, CI scripts).

## Installation

```bash
npm install @cogability/sdk
```

For browser OIDC flows (login/logout), also install the peer dependency:

```bash
npm install oidc-client-ts
```

## Three clients

| Client | Purpose | Works in |
|---|---|---|
| `CamClient` | Chat sessions, streaming messages | Browser + Node.js |
| `CmgClient` | Membership validation, geofencing | Browser + Node.js |
| `AuthClient` | OIDC login / callback via App ID | Browser only |

---

## CamClient — anonymous chat (browser SPA)

```js
import { CamClient, BrowserSessionStore } from '@cogability/sdk';

const cam = new CamClient({
  host: 'https://cam.example.com',  // omit in Vite dev (uses proxy)
  cogbotId: 'mc_0091:full',
  sessionStore: new BrowserSessionStore(),
});

// 1. Establish session + fetch config
await cam.initAnonymous();
const config = await cam.initCogbot();
const greeting = await cam.fetchGreeting();

// 2. Send a message (non-streaming)
const response = await cam.sendMessage('Hello');
const items = CamClient.parseResponseGeneric(response);
console.log(items[0].text);

// 3. Send a message (streaming)
for await (const { eventName, data } of cam.streamMessage('Tell me more')) {
  if (eventName === 'partial_object') {
    process.stdout.write(CamClient.parseResponseGeneric(data)[0]?.text ?? '');
  } else if (eventName === 'final_response') {
    console.log('\n[done]');
  }
}
```

## CamClient — authenticated chat (browser SPA)

After the user logs in and you have their `idToken`:

```js
await cam.initAuthenticated(idToken);
for await (const event of cam.streamMessage('Save my profile', { anonymous: false })) {
  // handle event
}
```

## CmgClient — membership validation (any framework)

```js
import { CmgClient } from '@cogability/sdk';

const cmg = new CmgClient({
  host: 'https://cmg.example.com',
  namespace: 'my-namespace',
});

// Validate a logged-in user's membership
const { isMember, roles, geofenced, codeRequired } = await cmg.validateMembership(idToken);

// Check geofence for an anonymous visitor (fails open)
const { geofenced, message } = await cmg.checkGeofence();
```

### `validateMembership(idToken, namespace?)` — return shape (`MembershipResult`)

| Field | Type | Description |
|---|---|---|
| `isMember` | boolean | CMG confirmed namespace membership. |
| `autoProvisioned` | boolean | CMG auto-created the membership record on this login. |
| `hasProfile` | boolean | Member has a stored profile in CMG. |
| `roles` | `Role[]` | Roles granted to this user in the namespace. |
| `geofenced` | boolean | This IP is outside the allowed region. |
| `geofenceMessage` | string \| null | Human-readable message when geofenced. |
| `codeRequired` | boolean | The namespace requires an access code to join. `true` when the user is authenticated but not yet a member because the namespace is code-gated. See `redeemCode` below. |

### `redeemCode({ idToken, code, namespace? })` — access-code redemption

Provisions membership for a code-gated namespace. Call this after `validateMembership` returns `codeRequired: true` and the user has entered a code.

On success the server auto-provisions the user and returns resolved roles (same shape as a successful `validateMembership`). On an invalid or expired code the server returns HTTP 400 and the result is **returned** (not thrown) so the caller can surface a retry UI. On HTTP 503 an error is **thrown**.

| Option | Type | Required | Description |
|---|---|---|---|
| `idToken` | string | yes | App ID JWT id_token. |
| `code` | string | yes | Access code entered by the user. |
| `namespace` | string | no | Override the namespace set at construction. |

**Returns `RedeemCodeResult`:**

| Field | Type | Description |
|---|---|---|
| `isMember` | boolean | `true` when the code was valid and membership was provisioned. |
| `autoProvisioned` | boolean | `true` when CMG auto-created the membership record. |
| `roles` | `Role[]` | Roles granted on success; empty on failure. |
| `geofenced` | boolean | IP is outside the allowed region. |
| `geofenceMessage` | string \| null | Human-readable geofence message. |
| `codeRequired` | boolean | `true` when the code was rejected and a retry is still possible. |
| `error` | string \| null | `'invalid_code'` on a bad/expired code; `null` on success. |

**Error behavior:**

| HTTP status | Behavior |
|---|---|
| 200 (success) | Returns result with `isMember: true`, `roles` populated. |
| 400 (invalid code) | Returns result with `isMember: false`, `error: 'invalid_code'`, `codeRequired: true`. |
| 503 (service unavailable) | **Throws** an `Error`. |

```js
// After validateMembership returns codeRequired: true
const result = await cmg.redeemCode({ idToken, code: 'ABC-123' });

if (result.isMember) {
  console.log('Access granted. Roles:', result.roles);
} else if (result.error === 'invalid_code') {
  console.warn('Invalid or expired code — prompt the user to retry');
} else if (result.geofenced) {
  console.warn('Geofenced:', result.geofenceMessage);
}
```

## AuthClient — OIDC login flow (browser only)

```js
import { AuthClient } from '@cogability/sdk';

const auth = new AuthClient({
  authorityUrl: 'https://us-south.appid.cloud.ibm.com/oauth/v4/YOUR_TENANT',
  clientId: 'YOUR_CLIENT_ID',
  redirectUri: `${window.location.origin}/callback`,
  // Routes token exchange through CMG to avoid App ID CORS restrictions:
  tokenEndpointProxy: 'https://cmg.example.com/auth/token',
});

// Trigger login redirect
await auth.login('/members');

// On the /callback page:
const { user, idToken } = await auth.handleCallback();
console.log('Logged in as', user.email);

// Later:
await auth.logout();
```

---

## Node.js agent — programmatic CogBot access

Agents skip OIDC entirely and pass tokens directly.

```js
import { CamClient, CmgClient, MemorySessionStore } from '@cogability/sdk';

const cam = new CamClient({
  host: 'https://cam.example.com',
  cogbotId: 'mc_0091:full',
  sessionStore: new MemorySessionStore(),
  getHostUrl: () => 'https://agent.example.com',
});

const cmg = new CmgClient({
  host: 'https://cmg.example.com',
  namespace: 'my-namespace',
});

// Anonymous session — no login required
await cam.initAnonymous();
await cam.initCogbot();

// Check membership status for a known user token
const membership = await cmg.validateMembership(agentIdToken);
if (membership.isMember) {
  await cam.initAuthenticated(agentIdToken);
}

// Stream a conversation
for await (const { eventName, data } of cam.streamMessage('What are my membership benefits?')) {
  if (eventName === 'final_response') {
    const text = CamClient.parseResponseGeneric(data)
      .filter(g => g.response_type === 'text')
      .map(g => g.text)
      .join('\n');
    console.log(text);
  }
}
```

## Vue / vanilla JS — drop-in chat widget

```js
import { CamClient, BrowserSessionStore } from '@cogability/sdk';

const cam = new CamClient({
  host: import.meta.env.VITE_COGBOT_HOST,
  cogbotId: import.meta.env.VITE_COGBOT_ID,
  sessionStore: new BrowserSessionStore(),
});

await cam.initAnonymous();
await cam.initCogbot();

document.getElementById('send').addEventListener('click', async () => {
  const text = document.getElementById('input').value;
  const output = document.getElementById('output');
  output.textContent = '';

  for await (const { eventName, data } of cam.streamMessage(text)) {
    if (eventName === 'partial_object') {
      const parts = CamClient.parseResponseGeneric(data)
        .filter(g => g.response_type === 'text');
      if (parts[0]) output.textContent = parts[0].text;
    }
  }
});
```

---

## Chat sessions and conversation history

### Starting a new chat

`CamClient` automatically mints and persists a `chat_id` UUID on first use. The same `chat_id` is included in every `_buildMessageBody()` call so the PFC2 backend can key the RAG conversation to a single LangGraph checkpoint (`general_thread_id`).

When the user clicks "New Chat", call `rotateChatId()` before re-initializing:

```js
// New Chat — creates a fresh RAG checkpoint on the next message turn
cam.rotateChatId();
await cam.initAnonymous(); // or initAuthenticated(idToken)
await cam.initCogbot();
const greeting = await cam.fetchGreeting();
```

`rotateChatId()` mints a new UUID, persists it in the session store under `buddy_chat_id`, and returns it. All subsequent `sendMessage` / `streamMessage` calls will carry the new `chat_id`, and PFC2 will start a fresh conversation thread with no prior history.

### Fetching conversation history

```js
// Retrieve the current DI + RAG conversation thread
const history = await cam.fetchConversationHistory();

// Or retrieve any past conversation by its chat_id (added in 0.4.0)
const past = await cam.fetchConversationHistory('chat-uuid-from-listConversations');

console.log(history.turns);
// [
//   { role: 'user', content: 'What can you do?' },
//   { role: 'assistant', content: 'I can answer your questions.' },
// ]

console.log(history.transcript_text);
// "User: What can you do?\nAssistant: I can answer your questions."

if (history.summary) {
  console.log('Summarized prefix:', history.summary);
}
```

`fetchConversationHistory(chatId?)` calls `GET /api/cogbots/{cogbotId}/id/{uid}/conversation-history?chat_id=...` on the PFC2 backend. When `chatId` is omitted the SDK falls back to the current `buddy_chat_id` in the session store. Pass an explicit id (e.g. one returned by `listConversations()`) to load a different past conversation. The response shape is:

| Field | Type | Description |
|---|---|---|
| `thread_id` | string | The LangGraph `general_thread_id` for this chat |
| `chat_id` | string | The `chat_id` that was sent with messages |
| `turns` | `{ role, content }[]` | Human/assistant exchanges in order; SDI turns excluded |
| `transcript_text` | string | Plain-text transcript, suitable for live-agent handoff |
| `summary` | string \| null | Rolling summary from `SummarizationMiddleware` if triggered |

### Listing a member's prior conversations

> **Available in `@cogability/sdk@0.4.0+`. Authenticated sessions only.**

When the user signs in via `initAuthenticated(idToken)`, the SDK can enumerate every past chat thread that member has on record — useful for rendering a "Previous Chats" sidebar (a la babybrain.ai or ChatGPT's left rail).

```js
await cam.initAuthenticated(idToken);
const { conversations } = await cam.listConversations();

// [
//   {
//     chat_id: '7e5b...',
//     last_updated: '2026-05-26T20:00:00Z',
//     title: 'When should my baby start solids?',
//     turn_count: 4,
//   },
//   ...
// ]

// Click handler: load a prior conversation into the chat widget
async function openPastChat(chatId) {
  const { turns } = await cam.fetchConversationHistory(chatId);
  renderTurns(turns);
}
```

`listConversations()` calls `GET /api/cogbots/{cogbotId}/id/{uid}/conversations` on the PFC2 backend. Response shape:

| Field | Type | Description |
|---|---|---|
| `conversations[].chat_id` | string | UI chat identifier; pass to `fetchConversationHistory(chatId)` |
| `conversations[].last_updated` | string | ISO 8601 timestamp of the latest checkpoint in this thread |
| `conversations[].title` | string \| null | First user message, ellipsized to 80 chars; `null` if the thread has no human turn |
| `conversations[].turn_count` | number \| null | Count of human + assistant exchanges, excluding rolling summary system messages |

Conversations are returned newest-first, capped at 50 by the backend. Anonymous sessions receive an empty list (the underlying `uid` is a per-browser random UUID with no server-side enumeration). The endpoint requires an authenticated CAM session — see [be-pfc/docs/cascade-architecture.md — Conversation List API](https://github.com/CogAbility/be-pfc/blob/pfc-2.0/docs/cascade-architecture.md#conversation-list-api) for backend details.

### Session storage keys

| Key | Description |
|---|---|
| `buddy_user_id` | Stable user UID minted on first anonymous session |
| `buddy_cogbot_sid` | Safari-compatible session cookie fallback |
| `buddy_chat_id` | Current chat UUID; rotated by `rotateChatId()` |

### Fetching the profile schema (driven by the cogbot's major)

```js
const schema = await cam.fetchProfileSchema();

if (schema) {
  // Render a dynamic form from schema.sections — e.g. with the
  // <DynamicProfileForm> component in @cogability/membership-kit.
} else {
  // No profile_schema configured on this cogbot's major yet.
  // Render the app's built-in (hard-coded) form.
}
```

`fetchProfileSchema()` calls `GET /api/cogbots/{cogbotId}/profile-schema` on the PFC2 backend. The server resolves `cogbot_id -> CogBotConfig.major_name -> CogMajorConfig.profile_schema` and returns the typed schema. Returns `null` on HTTP 404 so callers can fall back to a built-in form during rollout — the schema is published doc-by-doc on each major, not all at once.

Response shape (all fields optional, snake_case on the wire):

| Field | Type | Description |
|---|---|---|
| `version` | number | Schema version. Currently `1`. |
| `sections` | `ProfileSection[]` | Ordered list of form sections (e.g. parent, children). |
| `extras_bucket` | `ProfileExtrasBucket` | Optional bucket for ad-hoc keys not covered by any section. |

Each `ProfileSection` has a `section_type` of `"object"` (single record, e.g. parent) or `"list"` (repeating items, e.g. children). Each `ProfileField` has a `field_type` of `text | textarea | date | number | select | multiselect | boolean`, plus optional `required`, `options`, `min_value` / `max_value`, `pattern`, and a small `show_when` expression for conditional visibility (e.g. `"birthContext == 'premature'"`). See `types.js` for the full JSDoc typedefs.

No session or `chat_id` is required for this endpoint; the schema is per-cogbot, non-sensitive UI metadata. Auth is the same JWT/Basic surface as the rest of `/api/cogbots/*`.

---

## Session storage

| Class | When to use |
|---|---|
| `BrowserSessionStore` | Browser SPAs — wraps `window.sessionStorage` |
| `MemorySessionStore` | Node.js, SSR, tests — in-process Map |

Custom stores implement three methods: `get(key)`, `set(key, value)`, `remove(key)`.

## Advanced: raw SSE parsing

```js
import { parseSseBlock, parseSseStream } from '@cogability/sdk';

// Parse a single SSE block string
const event = parseSseBlock('event: partial_object\ndata: {"output":{"generic":[]}}');

// Parse a fetch Response body as a stream
const res = await fetch('https://cam.example.com/api/cogbots/my-bot/id/uid/message/stream', {
  method: 'POST', body: JSON.stringify(payload), credentials: 'include',
});
for await (const event of parseSseStream(res)) {
  console.log(event.eventName, event.data);
}
```

---

## Environment variables (Vite)

When using inside the membership-kit or template, the SDK reads these via `import.meta.env`:

| Variable | Used by |
|---|---|
| `VITE_COGBOT_HOST` | CamClient host (production) |
| `VITE_COGBOT_ID` | CamClient cogbotId |
| `VITE_CMG_URL` | CmgClient host |
| `VITE_SITE_NAMESPACE` | CmgClient namespace |
| `VITE_APPID_OAUTH_SERVER_URL` | AuthClient authorityUrl |
| `VITE_APPID_CLIENT_ID` | AuthClient clientId |
