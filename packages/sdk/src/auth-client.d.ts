import type { AuthClientOptions } from './types.js';

export interface AuthUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  idToken: string;
  accessToken: string;
  raw: object;
}

export interface AuthCallbackResult {
  user: AuthUser;
  idToken: string;
  accessToken: string;
}

/**
 * A token set issued by App ID but obtained outside this client, such as the
 * response from the Microsoft broker's redemption endpoint.
 */
export interface ExternalTokenSet {
  id_token: string;
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  /**
   * Rarely correct. App ID binds a refresh token to the client that obtained
   * it, so one issued to a confidential client cannot be renewed through the
   * CMG token proxy.
   */
  refresh_token?: string;
}

/**
 * OIDC authentication client for App ID. Browser-only.
 * Node.js agents should skip OIDC and pass tokens directly to
 * CamClient.initAuthenticated() and CmgClient.validateMembership().
 */
export class AuthClient {
  constructor(options: AuthClientOptions);

  /** Redirect the browser to the App ID login page. */
  login(returnTo?: string): Promise<void>;

  /** Process the OIDC redirect callback. Call this on the /callback page. */
  handleCallback(): Promise<AuthCallbackResult>;

  /**
   * Adopt App ID tokens obtained outside this client (e.g. from the Microsoft
   * sign-in broker) and store them as the current OIDC session.
   */
  signInWithExternalTokens(tokens: ExternalTokenSet): Promise<AuthCallbackResult>;

  /** Clear the OIDC session state (local only; does not perform server-side logout). */
  logout(): Promise<void>;

  /** Return the currently stored OIDC user, or null if not logged in. */
  getUser(): Promise<object | null>;

  /** Return the id_token string from the currently stored OIDC user, or null. */
  getIdToken(): Promise<string | null>;

  /**
   * Watch for inactivity and end the session when the idle timeout or absolute
   * cap is crossed. Opt-in; returns a function that stops the monitor.
   */
  startActivityMonitor(): () => void;

  /** Stop the activity monitor started by `startActivityMonitor()`. */
  stopActivityMonitor(): void;
}

/**
 * Create an AuthClient from Vite-style VITE_* environment variables.
 * Convenience factory for SPA consumers.
 */
export function createAuthClientFromEnv(cmgUrl: string): AuthClient;
