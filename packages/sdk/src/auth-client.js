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
 *     persistSession: true, // keep the user signed in across tab closes / browser restarts
 *   });
 *   await auth.login('/members');
 *   // ... on /callback page:
 *   const { user, idToken } = await auth.handleCallback();
 */

/** Renew this many seconds before the access token actually expires. */
const RENEW_SKEW_SECONDS = 60;

export class AuthClient {
  /**
   * @param {import('./types.js').AuthClientOptions} options
   * @param {boolean} [options.persistSession=false] - When true, the OIDC session
   *   (id_token, access_token, refresh_token) is stored in localStorage instead of
   *   sessionStorage, so the user stays signed in across tab closes and browser
   *   restarts. Trade-off: tokens in localStorage are readable by XSS, so only
   *   enable this if you trust your app's XSS posture. Defaults to false.
   */
  constructor({ authorityUrl, clientId, redirectUri, tokenEndpointProxy, persistSession = false } = {}) {
    if (!authorityUrl) throw new Error('AuthClient: authorityUrl is required');
    if (!clientId) throw new Error('AuthClient: clientId is required');
    if (!redirectUri) throw new Error('AuthClient: redirectUri is required');
    if (!tokenEndpointProxy) throw new Error('AuthClient: tokenEndpointProxy is required (CMG /auth/token URL)');

    this._config = { authorityUrl, clientId, redirectUri, tokenEndpointProxy, persistSession };
    this._manager = null;
    this._renewal = null;
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

    let UserManager, WebStorageStateStore;
    try {
      const mod = await import('oidc-client-ts');
      UserManager = mod.UserManager;
      WebStorageStateStore = mod.WebStorageStateStore;
    } catch {
      throw new Error(
        'AuthClient: oidc-client-ts is not installed. ' +
        'Add it as a dependency: npm install oidc-client-ts'
      );
    }

    const { authorityUrl, clientId, redirectUri, tokenEndpointProxy, persistSession } = this._config;

    let userStore;
    if (persistSession) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          userStore = new WebStorageStateStore({ store: window.localStorage });
        }
      } catch {
        // localStorage unavailable (e.g. privacy mode); fall back to the default.
      }
    }

    this._manager = new UserManager({
      authority: authorityUrl,
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      ...(userStore ? { userStore } : {}),
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
   * If the stored tokens have expired (or are about to) and a refresh_token is
   * available, they are silently renewed via the refresh_token grant, which
   * routes through the CMG /auth/token proxy. An expired session that cannot be
   * renewed resolves to null rather than returning a stale token, so callers get
   * a clean "logged out" signal instead of a guaranteed 401 from the API.
   *
   * @returns {Promise<import('oidc-client-ts').User | null>}
   */
  async getUser() {
    let manager;
    try {
      manager = await this._getManager();
    } catch {
      return null;
    }

    let user;
    try {
      user = await manager.getUser();
    } catch {
      return null;
    }
    if (!user) return null;

    const expiringSoon =
      user.expired === true ||
      (typeof user.expires_in === 'number' && user.expires_in <= RENEW_SKEW_SECONDS);
    if (!expiringSoon) return user;

    if (!user.refresh_token) {
      return user.expired === true ? null : user;
    }

    // Collapse concurrent callers onto one renewal: App ID rotates refresh
    // tokens, so parallel grants would invalidate each other.
    if (!this._renewal) {
      this._renewal = manager
        .signinSilent()
        .catch(() => null)
        .finally(() => {
          this._renewal = null;
        });
    }
    return await this._renewal;
  }

  /**
   * Return a currently valid id_token string, renewing it if needed, or null.
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
 *
 * Convenience factory for SPA consumers. Defaults `redirectUri` to
 * `${window.location.origin}/callback`, which works on hosts that do SPA
 * fallback (Vercel, Netlify, Cloudflare Pages, custom CDN).
 *
 * If you are deploying to a host WITHOUT SPA fallback (Lovable
 * *.lovable.app, GitHub Pages without the 404.html hack), construct
 * `AuthClient` manually with `redirectUri: \`${window.location.origin}/\``
 * and handle the OAuth callback at the site root. The `@cogability/membership-kit`
 * App component handles this automatically when you set
 * `VITE_ROUTER_MODE=hash` in your `.env.production`.
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
