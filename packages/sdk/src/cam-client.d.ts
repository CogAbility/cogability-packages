import type {
  CamClientOptions,
  CogbotSession,
  MessageResponse,
  MessageResponseGeneric,
  SseEvent,
  ConversationHistoryResponse,
  ConversationListResponse,
  ProfileSchema,
  ParentInfo,
  ChildInfo,
} from './types.js';

export class CamLimitError extends Error {
  status: number;
  code?: string;
  body?: unknown;
  constructor(message: string, options: { status: number; code?: string; body?: unknown });
}

export class CamClient {
  host: string;
  cogbotId: string;
  language: string;
  country: string;

  constructor(options: CamClientOptions);

  // Session establishment
  /** Establish an anonymous session with CAM. */
  initAnonymous(): Promise<CogbotSession>;
  /** Establish an authenticated session using the user's App ID id_token. */
  initAuthenticated(idToken: string): Promise<CogbotSession>;

  // Cogbot configuration
  /** Fetch the cogbot init config (widget theme, auth settings, streaming flag, etc.). Must be called after initAnonymous() or initAuthenticated(). */
  initCogbot(): Promise<object>;

  // Chat-session management
  /** Rotate the chat_id, returning the new value. Call when the user starts a new conversation. */
  rotateChatId(): string;

  // Greeting
  /** Fetch the welcome/greeting message. Must be called after initAnonymous(). */
  fetchGreeting(options?: { hostUrl?: string }): Promise<MessageResponse>;

  // Messaging
  /** Send a message and return the full assistant response (non-streaming). */
  sendMessage(
    text: string,
    options?: { anonymous?: boolean; hostUrl?: string }
  ): Promise<MessageResponse>;

  /** Send a message via SSE streaming. Yields SseEvent objects for each SSE event. */
  streamMessage(
    text: string,
    options?: { anonymous?: boolean; hostUrl?: string; signal?: AbortSignal }
  ): AsyncGenerator<SseEvent, void, unknown>;

  // Conversation history
  /**
   * Fetch the conversation history for the current chat session from PFC2.
   * Pass an explicit chatId from listConversations() to load a prior conversation.
   */
  fetchConversationHistory(chatId?: string): Promise<ConversationHistoryResponse>;

  /**
   * List the authenticated user's prior chat conversations for this cogbot.
   * Only meaningful for authenticated sessions — anonymous callers receive an empty list or 401.
   */
  listConversations(): Promise<ConversationListResponse>;

  // Profile schema
  /**
   * Fetch the member-profile schema that drives the onboarding/profile form for this cogbot.
   * Returns null when the major has no profile_schema configured (HTTP 404).
   * Callers should treat null as "use the built-in form".
   */
  fetchProfileSchema(): Promise<ProfileSchema | null>;

  // Static helpers
  /**
   * Compose a natural-language onboarding message from profile data.
   * The be-pfc agent's save_memory tool will parse this and store it in Pinecone.
   */
  static buildOnboardingMessage(parentInfo: ParentInfo, children: ChildInfo[]): string;

  /**
   * Extract the displayable generic items from a CCA2/Watson-style response.
   */
  static parseResponseGeneric(response: MessageResponse): MessageResponseGeneric[];
}
