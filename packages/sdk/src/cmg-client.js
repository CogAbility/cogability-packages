/**
 * CmgClient — HTTP client for the CogBot Membership Gateway (CMG) API.
 *
 * Consolidates the two separate CMG call paths that previously existed in the kit:
 *   - AuthProvider.jsx inline fetch to /auth/validate and /auth/geofence/check
 *   - useAuthorization.js inline fetch to /auth/validate
 *
 * Works in browser and Node.js. No browser globals.
 */

export class CmgClient {
  /**
   * @param {import('./types.js').CmgClientOptions} options
   */
  constructor({ host, namespace } = {}) {
    if (!host) throw new Error('CmgClient: host is required');
    if (!namespace) throw new Error('CmgClient: namespace is required');
    this.host = host.replace(/\/$/, '');
    this.namespace = namespace;
  }

  // ---------------------------------------------------------------------------
  // Membership validation
  // ---------------------------------------------------------------------------

  /**
   * Validate membership for an authenticated user.
   *
   * Verifies the App ID JWT, performs geofence checks, looks up the user in the
   * CMG whitelist, auto-provisions if configured, and returns resolved roles.
   *
   * @param {string} idToken - App ID JWT id_token.
   * @param {string} [namespaceOverride] - Override the namespace set at construction.
   * @returns {Promise<import('./types.js').MembershipResult>}
   */
  async validateMembership(idToken, namespaceOverride) {
    const namespace = namespaceOverride ?? this.namespace;
    const res = await fetch(`${this.host}/auth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, namespace }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `CmgClient: validateMembership failed (${res.status})`);
    }

    const data = await res.json();
    return {
      isMember: data.isMember === true,
      autoProvisioned: data.autoProvisioned === true,
      hasProfile: data.hasProfile === true,
      roles: data.roles ?? [],
      geofenced: data.geofenced === true,
      geofenceMessage: data.geofenceMessage ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Geofence check (anonymous)
  // ---------------------------------------------------------------------------

  /**
   * Check geofence status for an anonymous (unauthenticated) visitor.
   * Used to gate the public chat widget for non-allowed regions before login.
   * Fails open — if the request fails, assume not geofenced.
   *
   * @param {string} [namespaceOverride] - Override the namespace set at construction.
   * @returns {Promise<import('./types.js').GeofenceResult>}
   */
  async checkGeofence(namespaceOverride) {
    const namespace = namespaceOverride ?? this.namespace;
    try {
      const res = await fetch(
        `${this.host}/auth/geofence/check?namespace=${encodeURIComponent(namespace)}`
      );
      if (!res.ok) return { geofenced: false, message: null };
      const data = await res.json();
      return {
        geofenced: data.geofenced === true,
        message: data.message ?? null,
      };
    } catch {
      // Non-fatal — fail open so a CMG outage doesn't lock out all visitors.
      return { geofenced: false, message: null };
    }
  }

  // ---------------------------------------------------------------------------
  // Member profile (self-service)
  // ---------------------------------------------------------------------------

  /**
   * Save the authenticated member's profile to Cloudant via CMG.
   *
   * The profile is a free-form JSON object — the initial shape coming from the
   * onboarding wizard is `{ parent, children }`, but it can evolve over time.
   * CMG stamps `updatedAt` and `updatedBy: "self"` server-side.
   *
   * Requires the member to have a users DB record (i.e. at least one successful
   * login via `POST /auth/validate`).
   *
   * @param {string} idToken - App ID JWT id_token.
   * @param {Object} profile - Profile data to store.
   * @returns {Promise<{ ok: boolean, profile: Object }>}
   */
  async saveProfile(idToken, profile) {
    const res = await fetch(`${this.host}/auth/me/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, profile }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `CmgClient: saveProfile failed (${res.status})`);
    }
    return res.json();
  }

  /**
   * Get the authenticated member's stored profile from CMG.
   *
   * @param {string} idToken - App ID JWT id_token.
   * @returns {Promise<{ profile: Object | null }>}
   */
  async getProfile(idToken) {
    const res = await fetch(
      `${this.host}/auth/me/profile?idToken=${encodeURIComponent(idToken)}`
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `CmgClient: getProfile failed (${res.status})`);
    }
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // Login notification (admin)
  // ---------------------------------------------------------------------------

  /**
   * Notify CMG that a member has logged in (updates last_login fields).
   * Requires admin authentication — either an admin API key or an admin JWT.
   *
   * @param {string} email
   * @param {string} adminKey - Value of the `x-cmg-admin-key` header.
   * @returns {Promise<{ ok: boolean, skipped?: boolean }>}
   */
  async notifyLogin(email, adminKey) {
    const res = await fetch(`${this.host}/auth/notify-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cmg-admin-key': adminKey,
      },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(`CmgClient: notifyLogin failed (${res.status})`);
    return res.json();
  }
}
