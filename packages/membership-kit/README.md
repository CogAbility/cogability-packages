# @cogability/membership-kit

React 19 components, hooks, pages, and an `AuthProvider` for building a CogAbility-powered membership site. Built on top of [`@cogability/sdk`](https://www.npmjs.com/package/@cogability/sdk).

The kit ships a complete, production-ready membership SPA: anonymous chat on a public landing page, App ID sign-in, member onboarding wizard, profile management, and an authenticated members page with streaming chat. Clone the [cogbot-membership-website-template](https://github.com/CogAbility/cogbot-membership-website-template) to get started with zero configuration.

## Installation

```bash
npm install @cogability/membership-kit
```

Peer dependencies (install alongside the kit):

```bash
npm install react react-dom react-router-dom oidc-client-ts
```

---

## `useBuddyChat` hook

Manages the complete chat lifecycle — session init, greeting, streaming, and conversation history.

```jsx
import { useBuddyChat } from '@cogability/membership-kit';

function MyChat() {
  const {
    messages,          // { id, role: 'user'|'assistant', content }[]
    isLoading,         // true while a message response is in flight
    isInitializing,    // true during session init + greeting fetch
    error,             // string | null
    streamingText,     // in-progress assistant text during SSE streaming
    sendMessage,       // (text: string) => void
    retry,             // () => void — starts a new chat (rotates chat_id)
    fetchConversationHistory, // () => Promise<ConversationHistoryResponse>
    // Anonymous turn limit (null for authenticated users or when no limit is configured)
    turnsPerDay,       // number | null — configured daily limit from Cloudant
    remaining,         // number | null — turns remaining today (server-authoritative)
    limitReached,      // boolean — true once the daily limit is hit
  } = useBuddyChat();

  return (
    <div>
      {messages.map(msg => (
        <p key={msg.id}><strong>{msg.role}:</strong> {msg.content}</p>
      ))}
      {streamingText && <p><strong>assistant:</strong> {streamingText}</p>}
    </div>
  );
}
```

### Anonymous turn limit

When the cogbot has `anonymous_limits.turns_per_day` configured in its Cloudant config document, `useBuddyChat` exposes the limit state for anonymous users:

| Field | Type | Description |
|---|---|---|
| `turnsPerDay` | `number \| null` | The configured daily limit. `null` for authenticated users or when no limit is set. |
| `remaining` | `number \| null` | Turns remaining today. Accurate from the first render — seeded from the server on init. |
| `limitReached` | `boolean` | `true` once the server returns a 429 `anon_turn_limit` response. Persisted across page refreshes. |

`sendMessage` is a no-op while `limitReached` is `true`. Once the limit is hit, `BuddyChat` replaces the input area with the site-configured `limitReachedHeading` / `limitReachedBody` / `limitReachedCtaLabel` copy from `site.config.js`.

**Counter accuracy:** `remaining` is seeded from the real server-side count on every page load (init endpoint) and persisted to `localStorage` keyed by cogbot ID and UTC date. It resets automatically at UTC midnight, consistent with the server. This means:
- Refreshing the page shows the correct remaining count, not a reset "10 of 10".
- Opening an incognito window shows the correct remaining count.
- Multiple devices on the same IP share the same server-side bucket.

### `retry()` — New Chat

Calling `retry()` starts a brand-new conversation:

1. Calls `cam.rotateChatId()` — mints a fresh `chat_id` UUID so PFC2 opens a new LangGraph RAG checkpoint on the next message turn. The previous conversation history is preserved server-side but is no longer reachable from this session.
2. Clears `messages` and `error`.
3. Re-runs the full init sequence (`initAnonymous`/`initAuthenticated` → `initCogbot` → `fetchGreeting`).

```jsx
<button onClick={retry}>New Chat</button>
```

### `fetchConversationHistory()` — View Transcript

Returns the DI + RAG conversation thread for the current `chat_id` from PFC2's native history endpoint. SDI turns are excluded (SDI manages its own short-term context window independently).

```jsx
const history = await fetchConversationHistory();

// history.turns:
// [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]

// history.transcript_text:
// "User: ...\nAssistant: ..."

// history.summary (string | null):
// Set when SummarizationMiddleware has condensed older exchanges.
```

---

## `BuddyChat` component

A fully-styled chat widget backed by `useBuddyChat`. Drop it into any page:

```jsx
import { BuddyChat } from '@cogability/membership-kit';

<BuddyChat
  height="600px"           // optional — fixes the panel height
  className=""             // optional — extra Tailwind/CSS classes
  hideHeader={false}       // optional — hide the header bar (bot name + icons)
/>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `height` | string | — | CSS height for the chat panel. Omit for full flex-grow behavior. |
| `className` | string | `''` | Extra classes applied to the outermost `div`. |
| `hideHeader` | boolean | `false` | Hide the header bar (useful when embedding inside a card that has its own header). |

The kit's `BuddyChat` includes a **New Chat** button in the header and a **View Transcript** panel in the footer. Both are available on every page that renders the component — including the public landing page (anonymous users) and the authenticated members page.

---

## How New Chat and View Transcript work end-to-end

```
User clicks "New Chat"
  ↓
useBuddyChat.retry()
  ↓
cam.rotateChatId()          ← new UUID stored as buddy_chat_id
  ↓
cam.initAnonymous/Authenticated()
cam.initCogbot()
cam.fetchGreeting()          ← fresh greeting from a new RAG thread
  ↓
UI: messages cleared, new greeting shown

User clicks "View Transcript"
  ↓
useBuddyChat.fetchConversationHistory()
  ↓
cam.fetchConversationHistory()
  ↓
GET /api/cogbots/{id}/id/{uid}/conversation-history?chat_id=<current>
  ↓
PFC2 reads RAG LangGraph checkpoint at general_thread_id
  ↓
Returns { turns, transcript_text, summary? }
  ↓
UI: inline transcript panel rendered; summary block shown if present
```

---

## AuthProvider and authentication

```jsx
import { AuthProvider, useAuth } from '@cogability/membership-kit';

// Wrap your app (already done in App.jsx)
<AuthProvider config={siteConfig}>
  <YourApp />
</AuthProvider>

// In any component
const { user, idToken, isLoading, login, logout } = useAuth();
```

---

## Access-code membership gate

Some namespaces require an invite/access code before a logged-in user can become a member. `AuthProvider` handles the full redemption flow; `RoleGate` and `AccessCodeChallenge` surface it to the user automatically.

**End-user experience:** the user logs in normally → `AuthProvider` calls `validateMembership` → if the namespace is code-gated, the member area shows a code-entry form instead of the chat → the user enters their code → on a valid code, membership is provisioned and the member area loads immediately, with no page reload required.

### AuthProvider — access-code state

After login, if `validateMembership` returns `codeRequired: true`, `AuthProvider` sets `membershipStatus` to `'code_required'` and exposes the following additional state via `useAuth()`:

| Context value | Type | Description |
|---|---|---|
| `codeRequired` | boolean | `true` when the namespace requires a code and the user is not yet a member. |
| `codeError` | string \| null | Human-readable error message after a failed `redeemCode` attempt; `null` otherwise. Set to a generic "invalid or expired" message on HTTP 400, or a "service temporarily unavailable" message on a 503/network failure. |
| `codeSubmitting` | boolean | `true` while a `redeemCode` call is in-flight. Useful for disabling the submit button and showing a spinner. |
| `membershipStatus` | string | `'code_required'` when awaiting a code, plus the standard values `'none' \| 'checking' \| 'member' \| 'not_member' \| 'error'`. |

### `redeemCode(code)` — context function

```jsx
const { redeemCode, codeSubmitting, codeError } = useAuth();

const result = await redeemCode('ABC-123');
// result: { success: boolean, geofenced: boolean, unavailable: boolean }
```

| Return field | Type | Description |
|---|---|---|
| `success` | boolean | `true` when the code was accepted and `isMember` is now `true`. |
| `geofenced` | boolean | `true` when the user's IP was rejected by the geofence after code entry. |
| `unavailable` | boolean | `true` when the redemption service returned 503 or a network error occurred. |

On success, `AuthProvider` automatically flips `isMember` to `true`, populates `roles`, and clears `codeRequired` — no further action needed. On failure, `codeError` is set and `codeRequired` remains `true` so the user can retry.

### RoleGate — automatic code-challenge rendering

`RoleGate` checks `codeRequired && !isMember` before the standard membership check. When that condition is true it renders `<AccessCodeChallenge />` instead of `<AccessDenied />`. Once `redeemCode` succeeds and `isMember` becomes `true`, the gate re-renders and passes through to its children — no routing change required.

```jsx
import { RoleGate } from '@cogability/membership-kit';

// Wrap any page that requires membership:
<RoleGate>
  <MembersPage />
</RoleGate>

// With an optional role check:
<RoleGate requiredRole="bab:premium">
  <PremiumContent />
</RoleGate>
```

| Prop | Type | Description |
|---|---|---|
| `requiredRole` | string | Optional. After membership is confirmed, also verify this role (e.g. `"member"` or `"bab:premium"`). |
| `children` | ReactNode | Content to render when all checks pass. |

**Render logic (in order):**

1. Validating → spinner
2. Geofenced → `<AccessDenied variant="geofenced" />`
3. `codeRequired && !isMember` → `<AccessCodeChallenge />`
4. Not a member / validation error → `<AccessDenied />`
5. `requiredRole` not held → `<AccessDenied />`
6. All checks pass → `children`

### `AccessCodeChallenge` component

A self-contained code-entry card. Reads `codeRequired`, `codeError`, `codeSubmitting`, and `redeemCode` from `AuthContext`; returns `null` when `codeRequired` is `false`, making it safe to mount unconditionally.

`RoleGate` renders this automatically — you only need to import it directly if you want to place the form somewhere other than the gate.

```jsx
import { AccessCodeChallenge } from '@cogability/membership-kit';

<AccessCodeChallenge
  title="Enter your access code"
  description="This area is available to members with an access code."
  placeholder="Access code"
  submitLabel="Submit"
  onSuccess={() => navigate('/members')}
/>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `title` | string | `'Enter your access code'` | Card heading. |
| `description` | string | `'This area is available to members with an access code. Enter yours below to continue.'` | Body copy beneath the heading. |
| `placeholder` | string | `'Access code'` | Input placeholder and `aria-label`. |
| `submitLabel` | string | `'Submit'` | Submit button label. |
| `successMessage` | string | `'Access granted.'` | Screen-reader-only live-region text announced after successful redemption. |
| `onSuccess` | function | — | Optional callback fired after `redeemCode` returns `success: true`. |

### Required environment variables

| Variable | Description |
|---|---|
| `VITE_CMG_URL` | Base URL of the CMG service (e.g. `https://cmg.example.com`). Defaults to `http://localhost:3010` in dev. |
| `VITE_SITE_NAMESPACE` | Site/cogbot namespace (e.g. `bab`). Defaults to `'bab'` in dev. |

Both variables are read by `AuthProvider` at startup to construct the `CmgClient` instance. They must be set in your `.env` (or deployment environment) for the access-code flow to reach the correct CMG endpoint.

> For a full picture of the access-code system — CMG backend routes, code provisioning, and admin tooling — see the cross-service hub doc: [`cac-coguniversity-access-codes/docs/access-code-membership.md`](../../cac-coguniversity-access-codes/docs/access-code-membership.md).

---

## Exported components and pages

| Export | Description |
|---|---|
| `App` | Root application shell (router, auth, providers) |
| `BuddyChat` | Standalone chat widget |
| `CogBotEmbed` | Minimal embed wrapper for the chat widget |
| `Header` / `Footer` | Site header and footer |
| `Hero` | Public landing page hero section |
| `Features` / `About` / `Testimonials` | Landing page sections |
| `OnboardingProgressIndicator` | Step indicator for the onboarding wizard |
| `LoginPage` | App ID login page |
| `MembersPage` | Authenticated members page |
| `OnboardingPage` | New-member onboarding wizard |
| `ProfilePage` | Member profile management |
| `CallbackPage` | OAuth callback handler |
| `AccessDenied` | Non-member / role-denied screen |
| `AccessCodeChallenge` | Access-code entry form (rendered by `RoleGate` automatically; see above) |
| `AuthProvider` | OIDC auth context provider |
| `ProtectedRoute` | Route guard (redirects to login if unauthenticated) |
| `RoleGate` | Renders children only when membership/roles are satisfied |
| `useBuddyChat` | Chat lifecycle hook (see above) |
| `useAuth` | Auth state hook |
| `useAuthorization` | Membership/role check hook |
| `useSiteConfig` | Site config context hook |
| `SiteConfigProvider` | Config context provider |
| `cam` | The underlying `CamClient` instance (advanced use) |

---

## Source

Kit source lives in [`CogAbility/cogability-packages`](https://github.com/CogAbility/cogability-packages) under `packages/membership-kit/`. Contribute kit changes there — the template consumes the kit as a normal npm dependency.
