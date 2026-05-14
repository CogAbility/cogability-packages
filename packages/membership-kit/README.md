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

The template's `src/components/BuddyChat.jsx` extends the kit's default `BuddyChat` with a **New Chat** button and a **View Transcript** panel — browse that file for a real-world customization example.

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
