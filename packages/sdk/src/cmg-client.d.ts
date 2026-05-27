import type { CmgClientOptions, MembershipResult, GeofenceResult } from './types.js';

export class CmgClient {
  host: string;
  namespace: string;

  constructor(options: CmgClientOptions);

  /**
   * Validate membership for an authenticated user.
   * Verifies the App ID JWT, performs geofence checks, looks up the user in the CMG whitelist,
   * auto-provisions if configured, and returns resolved roles.
   */
  validateMembership(idToken: string, namespaceOverride?: string): Promise<MembershipResult>;

  /**
   * Check geofence status for an anonymous visitor.
   * Fails open — if the request fails, assumes not geofenced.
   */
  checkGeofence(namespaceOverride?: string): Promise<GeofenceResult>;

  /**
   * Save the authenticated member's profile to Cloudant via CMG.
   * CMG stamps updatedAt and updatedBy: "self" server-side.
   */
  saveProfile(idToken: string, profile: object): Promise<{ ok: boolean; profile: object }>;

  /**
   * Get the authenticated member's stored profile from CMG.
   */
  getProfile(idToken: string): Promise<{ profile: object | null }>;

  /**
   * Notify CMG that a member has logged in (updates last_login fields).
   * Requires admin authentication.
   */
  notifyLogin(email: string, adminKey: string): Promise<{ ok: boolean; skipped?: boolean }>;
}
