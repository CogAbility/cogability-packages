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

  /** Clear the OIDC session state (local only; does not perform server-side logout). */
  logout(): Promise<void>;

  /** Return the currently stored OIDC user, or null if not logged in. */
  getUser(): Promise<object | null>;

  /** Return the id_token string from the currently stored OIDC user, or null. */
  getIdToken(): Promise<string | null>;
}

/**
 * Create an AuthClient from Vite-style VITE_* environment variables.
 * Convenience factory for SPA consumers.
 */
export function createAuthClientFromEnv(cmgUrl: string): AuthClient;
