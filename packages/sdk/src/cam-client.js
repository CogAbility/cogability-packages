/**
 * CamClient — HTTP client for the CogBot Access Manager (CAM) API.
 *
 * Works in browser and Node.js 18+. The only browser global it touches is
 * `window.location.href` (via the optional `getHostUrl` constructor option),
 * which you can override for server-side use.
 *
 * Typical lifecycle (anonymous chat):
 *   const cam = new CamClient({ host, cogbotId, sessionStore: new BrowserSessionStore() });
 *   await cam.initAnonymous();
 *   await cam.initCogbot();
 *   const greeting = await cam.fetchGreeting();
 *   for await (const event of cam.streamMessage('Hello')) { ... }
 *
 * Authenticated lifecycle:
 *   await cam.initAuthenticated(idToken);
 *   for await (const event of cam.streamMessage('Hello', { anonymous: false })) { ... }
 */

import { MemorySessionStore } from './session-store.js';
import { parseSseStream } from './sse-parser.js';

const KEYS = {
  UID: 'buddy_user_id',
  SID: 'buddy_cogbot_sid',
};

function defaultGetHostUrl() {
  if (typeof window !== 'undefined') return window.location.href;
  return '';
}

export class CamClient {
  /**
   * @param {import('./types.js').CamClientOptions} options
   */
  constructor({
    host = '',
    cogbotId,
    language = 'en-US',
    country = 'US',
    sessionStore,
    getHostUrl = defaultGetHostUrl,
  } = {}) {
    if (!cogbotId) throw new Error('CamClient: cogbotId is required');
    this.host = host;
    this.cogbotId = cogbotId;
    this.language = language;
    this.country = country;
    this.store = sessionStore ?? new MemorySessionStore();
    this.getHostUrl = getHostUrl;
  }

  // ---------------------------------------------------------------------------
  // Session helpers
  // ---------------------------------------------------------------------------

  _getUid() {
    let uid = this.store.get(KEYS.UID);
    if (!uid) {
      uid = crypto.randomUUID();
      this.store.set(KEYS.UID, uid);
    }
    return uid;
  }

  _getSid() {
    return this.store.get(KEYS.SID) ?? '';
  }

  _setSid(sid) {
    if (sid) this.store.set(KEYS.SID, sid);
  }

  _appendSid(url) {
    const sid = this._getSid();
    if (!sid) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}cogbot_sid=${encodeURIComponent(sid)}`;
  }

  _cacheBust(url) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}rcode=${Math.floor(Math.random() * 100000)}`;
  }

  _url(path) {
    return `${this.host}${path}`;
  }

  _sessionUrl(path) {
    return this._cacheBust(this._appendSid(this._url(path)));
  }

  _handleSid(data) {
    if (data?.cogbot_sid) this._setSid(data.cogbot_sid);
  }

  // ---------------------------------------------------------------------------
  // Session establishment
  // ---------------------------------------------------------------------------

  /**
   * Establish an anonymous session with CAM.
   * CAM assigns a stable uid and optionally returns a cogbot_sid for Safari.
   *
   * @returns {Promise<import('./types.js').CogbotSession>}
   */
  async initAnonymous() {
    return this._setTokens({ idToken: 'anonymous' });
  }

  /**
   * Establish an authenticated session using the user's App ID id_token.
   * CAM will verify the token and associate the session with the user's identity.
   *
   * @param {string} idToken - App ID JWT id_token.
   * @returns {Promise<import('./types.js').CogbotSession>}
   */
  async initAuthenticated(idToken) {
    return this._setTokens({ idToken });
  }

  async _setTokens(tokens) {
    const url = this._sessionUrl('/api/settokens');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ tokens }),
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`CamClient: settokens failed (${res.status})`);
    const data = await res.json();
    if (data.uid) this.store.set(KEYS.UID, data.uid);
    this._handleSid(data);
    return { uid: this.store.get(KEYS.UID), cogbotSid: this._getSid() || undefined };
  }

  // ---------------------------------------------------------------------------
  // Cogbot configuration
  // ---------------------------------------------------------------------------

  /**
   * Fetch the cogbot init config (widget theme, auth settings, streaming flag, etc.).
   * Must be called after initAnonymous() or initAuthenticated().
   *
   * @returns {Promise<Object>} Raw CAM config response.
   */
  async initCogbot() {
    const url = this._sessionUrl(
      `/api/init/cogbots/${encodeURIComponent(this.cogbotId)}?language=${encodeURIComponent(this.language)}`
    );
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`CamClient: initCogbot failed (${res.status})`);
    const data = await res.json();
    this._handleSid(data);
    return data;
  }

  // ---------------------------------------------------------------------------
  // Greeting
  // ---------------------------------------------------------------------------

  /**
   * Fetch the welcome/greeting message. Must be called after initAnonymous().
   *
   * @param {{ hostUrl?: string }} [options]
   * @returns {Promise<import('./types.js').MessageResponse>}
   */
  async fetchGreeting({ hostUrl } = {}) {
    const uid = this._getUid();
    const params = new URLSearchParams({
      host_url: hostUrl ?? this.getHostUrl(),
      language: this.language,
      rcode: Math.floor(Math.random() * 100000).toString(),
    });
    if (uid) params.set('uid', uid);
    const sid = this._getSid();
    if (sid) params.set('cogbot_sid', sid);

    const url = this._url(`/api/v1/init/greeting/${encodeURIComponent(this.cogbotId)}?${params}`);
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`CamClient: fetchGreeting failed (${res.status})`);
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------

  /**
   * Send a message and return the full assistant response (non-streaming).
   *
   * @param {string} text
   * @param {{ anonymous?: boolean, hostUrl?: string }} [options]
   * @returns {Promise<import('./types.js').MessageResponse>}
   */
  async sendMessage(text, { anonymous = true, hostUrl } = {}) {
    const uid = this._getUid();
    const url = this._sessionUrl(
      `/api/cogbots/${encodeURIComponent(this.cogbotId)}/id/${uid}/message`
    );

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer anonymous',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(this._buildMessageBody(text, uid, { anonymous, hostUrl })),
      credentials: 'include',
    });

    if (!res.ok) throw new Error(`CamClient: sendMessage failed (${res.status})`);
    return res.json();
  }

  /**
   * Send a message via SSE streaming.
   *
   * Yields { eventName, data } objects for each SSE event. The generator
   * terminates when the stream ends or the AbortSignal fires.
   *
   * Event names: "partial_object", "object_ready", "final_response".
   *
   * @param {string} text
   * @param {{ anonymous?: boolean, hostUrl?: string, signal?: AbortSignal }} [options]
   * @yields {import('./types.js').SseEvent}
   */
  async *streamMessage(text, { anonymous = true, hostUrl, signal } = {}) {
    const uid = this._getUid();
    const url = this._sessionUrl(
      `/api/cogbots/${encodeURIComponent(this.cogbotId)}/id/${uid}/message/stream`
    );

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer anonymous',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json;q=0.9',
      },
      body: JSON.stringify(this._buildMessageBody(text, uid, { anonymous, hostUrl })),
      credentials: 'include',
      signal,
    });

    if (!res.ok) throw new Error(`CamClient: streamMessage failed (${res.status})`);

    yield* parseSseStream(res, { signal });
  }

  _buildMessageBody(text, uid, { anonymous = true, hostUrl } = {}) {
    return {
      input: [{ type: 'text', text }],
      context: { global: { system: { user_id: uid } } },
      metadata: {},
      user_id: uid,
      language: this.language,
      country: this.country,
      host_url: hostUrl ?? this.getHostUrl(),
      training: false,
      channel: 'web',
      anonymous,
    };
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  /**
   * Compose a natural-language onboarding message from profile data.
   * The be-pfc agent's save_memory tool will parse this and store it in Pinecone.
   *
   * @param {import('./types.js').ParentInfo} parentInfo
   * @param {import('./types.js').ChildInfo[]} children
   * @returns {string}
   */
  static buildOnboardingMessage(parentInfo, children) {
    const fullName = [parentInfo.firstName, parentInfo.lastName].filter(Boolean).join(' ');

    const childDescriptions = children.map((child) => {
      const parts = [`a child named ${child.name}`];
      if (child.gender) parts.push(`(${child.gender})`);
      const hasBirthday = child.birthMonth && child.birthDay && child.birthYear;
      if (hasBirthday) parts.push(`born ${child.birthMonth} ${child.birthDay} ${child.birthYear}`);
      return parts.join(' ');
    });

    const lines = [];
    if (fullName) lines.push(`My name is ${fullName}.`);
    if (childDescriptions.length === 1) {
      lines.push(`I have ${childDescriptions[0]}.`);
    } else if (childDescriptions.length > 1) {
      lines.push(`I have ${childDescriptions.length} children: ${childDescriptions.join(', ')}.`);
    }
    lines.push('Please save this to my profile.');
    return lines.join(' ');
  }

  /**
   * Extract the displayable generic items from a CCA2/Watson-style response.
   *
   * @param {import('./types.js').MessageResponse} response
   * @returns {import('./types.js').MessageResponseGeneric[]}
   */
  static parseResponseGeneric(response) {
    const generic = response?.output?.generic;
    return Array.isArray(generic) ? generic : [];
  }
}
