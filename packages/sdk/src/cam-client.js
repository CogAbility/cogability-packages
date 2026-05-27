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
  CHAT_ID: 'buddy_chat_id',
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
  // Chat-session (chat_id) management
  // ---------------------------------------------------------------------------

  /**
   * Return the current chat_id, creating one on first call.
   *
   * The chat_id is the PFC2 key for the RAG conversation checkpoint (the
   * ``general_thread_id`` on the backend is derived from this value).
   *
   * @returns {string}
   */
  _getChatId() {
    let chatId = this.store.get(KEYS.CHAT_ID);
    if (!chatId) {
      chatId = crypto.randomUUID();
      this.store.set(KEYS.CHAT_ID, chatId);
    }
    return chatId;
  }

  /**
   * Rotate the chat_id, returning the new value.
   *
   * Call this when the user starts a new conversation (e.g. the "New Chat"
   * button).  PFC2 will treat the next message as belonging to a fresh
   * ``general_thread_id``, starting an empty RAG checkpoint.
   *
   * @returns {string} The newly minted chat_id.
   */
  rotateChatId() {
    const next = crypto.randomUUID();
    this.store.set(KEYS.CHAT_ID, next);
    return next;
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
      chat_id: this._getChatId(),
      language: this.language,
      country: this.country,
      host_url: hostUrl ?? this.getHostUrl(),
      training: false,
      channel: 'web',
      anonymous,
    };
  }

  // ---------------------------------------------------------------------------
  // Conversation history
  // ---------------------------------------------------------------------------

  /**
   * Fetch the DI + RAG conversation history for the current chat session from
   * PFC2's native history endpoint.
   *
   * This replaces the CCA2 ``cca_conversation_history`` ui_action.  The
   * returned transcript contains only the turns stored in the RAG checkpoint
   * (DI and RAG responses); SDI turns are excluded.
   *
   * @param {string} [chatId] - Explicit chat_id to fetch history for. When
   *   omitted, falls back to the current session's chat_id (from the store).
   *   Pass an id from {@link listConversations} to load a prior conversation.
   * @returns {Promise<import('./types.js').ConversationHistoryResponse>}
   */
  async fetchConversationHistory(chatId) {
    const uid = this._getUid();
    const id = chatId ?? this._getChatId();
    const params = new URLSearchParams({ chat_id: id });
    const sid = this._getSid();
    if (sid) params.set('cogbot_sid', sid);
    params.set('rcode', String(Math.floor(Math.random() * 100000)));

    const url = this._url(
      `/api/cogbots/${encodeURIComponent(this.cogbotId)}/id/${uid}/conversation-history?${params}`
    );

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    if (!res.ok) throw new Error(`CamClient: fetchConversationHistory failed (${res.status})`);
    return res.json();
  }

  /**
   * List the authenticated user's prior chat conversations for this cogbot.
   *
   * Calls GET /api/cogbots/{cogbotId}/id/{uid}/conversations on the be-pfc
   * backend (forwarded by CAM). Only meaningful for authenticated sessions
   * (initAuthenticated) — anonymous callers will receive an empty list or 401.
   *
   * @returns {Promise<import('./types.js').ConversationListResponse>}
   */
  async listConversations() {
    const uid = this._getUid();
    const url = this._url(
      `/api/cogbots/${encodeURIComponent(this.cogbotId)}/id/${uid}/conversations`
    );
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`CamClient: listConversations failed (${res.status})`);
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // Profile schema
  // ---------------------------------------------------------------------------

  /**
   * Fetch the member-profile schema that drives the onboarding/profile form
   * for this cogbot.
   *
   * The schema is authored on the Cloudant ``major/{name}`` doc (see be-pfc's
   * ``profile_schema`` block) so per-vertical field sets — parent, children,
   * pets, dietary preferences, etc. — can change without redeploying the
   * member SPA or the kit.
   *
   * Resolution path on the server:
   *
   *     cogbot_id -> CogBotConfig.major_name -> CogMajorConfig.profile_schema
   *
   * Returns ``null`` when the major has no ``profile_schema`` configured
   * (HTTP 404). Callers should treat ``null`` as "use the built-in form"
   * — this is how rollout proceeds doc-by-doc rather than all-at-once.
   *
   * No session or chat_id is required; the endpoint is per-cogbot and the
   * shape is non-sensitive UI metadata. Auth is the same JWT/Basic surface as
   * the rest of ``/api/cogbots/*``.
   *
   * @returns {Promise<import('./types.js').ProfileSchema|null>}
   */
  async fetchProfileSchema() {
    const url = this._url(
      `/api/cogbots/${encodeURIComponent(this.cogbotId)}/profile-schema`
    );
    const res = await fetch(url, { credentials: 'include' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`CamClient: fetchProfileSchema failed (${res.status})`);
    return res.json();
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
