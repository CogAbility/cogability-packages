/**
 * AuthClient — OIDC authentication client for App ID.
 *
 * Wraps oidc-client-ts with CogAbility-specific defaults:
 *   - Routes the token exchange through the CMG /auth/token proxy (server-to-server)
 *     because App ID's token endpoint does not support CORS from browser origins.
 *   - Provides a clean, minimal API surface for login, callback handling, and logout.
 *
 * This class is browser-only (it drives redirect-based OIDC flows and accesses
 * window.location). Node.js agents should skip OIDC and pass tokens directly to
 * CamClient.initAuthenticated() and CmgClient.validateMembership().
 *
 * Peer dependency: oidc-client-ts ^3.5.0
 *
 * Usage:
 *   const auth = new AuthClient({
 *     authorityUrl: process.env.VITE_APPID_OAUTH_SERVER_URL,
 *     clientId: process.env.VITE_APPID_CLIENT_ID,
 *     redirectUri: `${window.location.origin}/callback`,
 *     tokenEndpointProxy: `${process.env.VITE_CMG_URL}/auth/token`,
 *   });
 *   await auth.login('/members');
 *   // ... on /callback page:
 *   const { user, idToken } = await auth.handleCallback();
 */

export class AuthClient {
  /**
   * @param {import('./types.js').AuthClientOptions} options
   */
  constructor({ authorityUrl, clientId, redirectUri, tokenEndpointProxy } = {}) {
    if (!authorityUrl) throw new Error('AuthClient: authorityUrl is required');
    if (!clientId) throw new Error('AuthClient: clientId is required');
    if (!redirectUri) throw new Error('AuthClient: redirectUri is required');
    if (!tokenEndpointProxy) throw new Error('AuthClient: tokenEndpointProxy is required (CMG /auth/token URL)');

    this._config = { authorityUrl, clientId, redirectUri, tokenEndpointProxy };
    this._manager = null;
  }

  /**
   * Lazy-initialise the oidc-client-ts UserManager.
   * Uses dynamic import() so the SDK can be loaded in Node.js environments
   * where oidc-client-ts is not installed (agents skip OIDC entirely).
   *
   * @returns {Promise<import('oidc-client-ts').UserManager>}
   */
  async _getManager() {
    if (this._manager) return this._manager;

    let UserManager;
    try {
      const mod = await import('oidc-client-ts');
      UserManager = mod.UserManager;
    } catch {
      throw new Error(
        'AuthClient: oidc-client-ts is not installed. ' +
        'Add it as a dependency: npm install oidc-client-ts'
      );
    }

    const { authorityUrl, clientId, redirectUri, tokenEndpointProxy } = this._config;

    this._manager = new UserManager({
      authority: authorityUrl,
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      // Override the metadata so the token exchange goes through the CMG proxy.
      // App ID's token endpoint rejects CORS preflight from browser origins.
      metadata: {
        issuer: authorityUrl,
        authorization_endpoint: `${authorityUrl}/authorization`,
        token_endpoint: tokenEndpointProxy,
        userinfo_endpoint: `${authorityUrl}/userinfo`,
        jwks_uri: `${authorityUrl}/publickeys`,
      },
    });

    return this._manager;
  }

  /**
   * Redirect the browser to the App ID login page.
   * Saves `returnTo` in sessionStorage so handleCallback can redirect back.
   *
   * @param {string} [returnTo='/members'] - Path to redirect to after login.
   */
  async login(returnTo = '/members') {
    sessionStorage.setItem('auth_return_to', returnTo);
    const manager = await this._getManager();
    await manager.signinRedirect();
  }

  /**
   * Process the OIDC redirect callback. Call this on the /callback page.
   *
   * @returns {Promise<{ user: object, idToken: string, accessToken: string }>}
   */
  async handleCallback() {
    const manager = await this._getManager();
    const oidcUser = await manager.signinRedirectCallback();

    const p = oidcUser.profile;
    const user = {
      uid: p.sub,
      email: p.email ?? '',
      firstName: p.given_name ?? p.name?.split(' ')[0] ?? '',
      lastName: p.family_name ?? p.name?.split(' ').slice(1).join(' ') ?? '',
      idToken: oidcUser.id_token,
      accessToken: oidcUser.access_token,
      raw: p,
    };

    return {
      user,
      idToken: oidcUser.id_token,
      accessToken: oidcUser.access_token,
    };
  }

  /**
   * Clear the OIDC session state.
   * Does NOT perform a server-side logout (no redirect to App ID end_session_endpoint).
   * Pair with clearing any app-level tokens from your session store.
   */
  async logout() {
    try {
      const manager = await this._getManager();
      const oidcUser = await manager.getUser();
      if (oidcUser) await manager.removeUser();
    } catch {
      // Best-effort cleanup
    }
  }

  /**
   * Return the currently stored OIDC user, or null if not logged in.
   *
   * @returns {Promise<import('oidc-client-ts').User | null>}
   */
  async getUser() {
    try {
      const manager = await this._getManager();
      return await manager.getUser();
    } catch {
      return null;
    }
  }

  /**
   * Return the id_token string from the currently stored OIDC user, or null.
   *
   * @returns {Promise<string | null>}
   */
  async getIdToken() {
    const user = await this.getUser();
    return user?.id_token ?? null;
  }
}

/**
 * Create an AuthClient from Vite-style VITE_* environment variables.
 * Convenience factory for use inside the membership-kit.
 *
 * @param {string} cmgUrl - Base URL of CMG (used to build the token proxy URL).
 * @returns {AuthClient}
 */
export function createAuthClientFromEnv(cmgUrl) {
  return new AuthClient({
    authorityUrl: import.meta.env.VITE_APPID_OAUTH_SERVER_URL,
    clientId: import.meta.env.VITE_APPID_CLIENT_ID,
    redirectUri: `${window.location.origin}/callback`,
    tokenEndpointProxy: `${cmgUrl}/auth/token`,
  });
}
