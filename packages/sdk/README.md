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
const { isMember, roles, geofenced } = await cmg.validateMembership(idToken);

// Check geofence for an anonymous visitor (fails open)
const { geofenced, message } = await cmg.checkGeofence();
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
