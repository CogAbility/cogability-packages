import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { CmgClient, createAuthClientFromEnv } from '@cogability/sdk';

/**
 * AuthContext provides:
 *   user                  - App ID user info (null when not logged in)
 *   isAuthenticated       - boolean
 *   isMember              - boolean, true only when CMG confirmed namespace membership
 *   roles                 - array of { namespace, name, display_name }
 *   autoProvisioned       - boolean, true when CMG auto-created the membership on this login
 *   membershipStatus      - "none" | "checking" | "member" | "not_member" | "error"
 *   geofenced             - boolean, true when CMG says this IP is outside the allowed region
 *   geofenceMessage       - string | null
 *   geofenceChecking      - boolean, true while the initial anonymous geofence probe is in-flight
 *   isLoading             - boolean (true during login/logout)
 *   error                 - string | null
 *   login(returnTo)       - redirects to App ID for authentication
 *   handleCallback()      - processes the redirect callback, returns { success, autoProvisioned }
 *   logout()              - clears session
 *   cmg                   - CmgClient instance (available to child hooks via useAuth())
 */
const AuthContext = createContext(null);

const CMG_URL = import.meta.env.VITE_CMG_URL || 'http://localhost:3010';
const SITE_NAMESPACE = import.meta.env.VITE_SITE_NAMESPACE || 'bab';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isMember, setIsMember] = useState(false);
  const [autoProvisioned, setAutoProvisioned] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [roles, setRoles] = useState([]);
  const [geofenced, setGeofenced] = useState(false);
  const [geofenceMessage, setGeofenceMessage] = useState(null);
  const [geofenceChecking, setGeofenceChecking] = useState(true);
  const [membershipStatus, setMembershipStatus] = useState('none');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Stable SDK client instances — created once, never recreated.
  const cmg = useMemo(() => new CmgClient({ host: CMG_URL, namespace: SITE_NAMESPACE }), []);
  const auth = useMemo(() => createAuthClientFromEnv(CMG_URL), []);

  // Anonymous geofence probe — runs once on mount before any login flow.
  // Lets the landing page gate the public chat widget for non-allowed regions.
  useEffect(() => {
    cmg.checkGeofence().then(({ geofenced: g, message }) => {
      if (g) {
        setGeofenced(true);
        setGeofenceMessage(message);
      }
    }).finally(() => {
      setGeofenceChecking(false);
    });
  }, [cmg]);

  const validateMembership = useCallback(async (idToken) => {
    setMembershipStatus('checking');
    try {
      const result = await cmg.validateMembership(idToken);
      setIsMember(result.isMember);
      setAutoProvisioned(result.autoProvisioned);
      setHasProfile(!!result.hasProfile);
      setRoles(result.roles);
      setGeofenced(result.geofenced);
      setGeofenceMessage(result.geofenceMessage);
      setMembershipStatus(result.isMember ? 'member' : 'not_member');
      return { autoProvisioned: !!result.autoProvisioned, hasProfile: !!result.hasProfile };
    } catch (err) {
      console.error('AuthProvider: membership validation error', err);
      setIsMember(false);
      setAutoProvisioned(false);
      setRoles([]);
      setGeofenced(false);
      setGeofenceMessage(null);
      setMembershipStatus('error');
      return { autoProvisioned: false, hasProfile: false };
    }
  }, [cmg]);

  const login = useCallback(async (returnTo = '/members') => {
    await auth.login(returnTo);
  }, [auth]);

  const handleCallback = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { user: oidcUser, idToken, accessToken } = await auth.handleCallback();

      sessionStorage.setItem('cam_token', idToken);
      sessionStorage.setItem('cam_access_token', accessToken);

      setUser(oidcUser);

      const { autoProvisioned: wasAutoProvisioned, hasProfile } = await validateMembership(idToken);
      return { success: true, autoProvisioned: wasAutoProvisioned, hasProfile };
    } catch (err) {
      console.error('AuthProvider: callback error', err);
      setError(err?.message || 'Login failed. Please try again.');
      return { success: false, autoProvisioned: false, hasProfile: false };
    } finally {
      setIsLoading(false);
    }
  }, [auth, validateMembership]);

  const logout = useCallback(async () => {
    sessionStorage.removeItem('cam_token');
    sessionStorage.removeItem('cam_access_token');
    sessionStorage.removeItem('auth_return_to');
    await auth.logout();
    setUser(null);
    setIsMember(false);
    setAutoProvisioned(false);
    setHasProfile(false);
    setRoles([]);
    setGeofenced(false);
    setGeofenceMessage(null);
    setMembershipStatus('none');
    setError(null);
  }, [auth]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isMember,
      autoProvisioned,
      hasProfile,
      roles,
      geofenced,
      geofenceMessage,
      geofenceChecking,
      membershipStatus,
      isLoading,
      error,
      login,
      handleCallback,
      logout,
      cmg,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
