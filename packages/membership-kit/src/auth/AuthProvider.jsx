import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { AuthClient, CmgClient } from '@cogability/sdk';

/**
 * AuthContext provides:
 *   user                  - App ID user info (null when not logged in)
 *   isAuthenticated       - boolean
 *   isMember              - boolean, true only when CMG confirmed namespace membership
 *   roles                 - array of { namespace, name, display_name }
 *   autoProvisioned       - boolean, true when CMG auto-created the membership on this login
 *   membershipStatus      - "none" | "checking" | "member" | "not_member" | "code_required" | "error"
 *   codeRequired          - boolean, true when CMG says this namespace needs an access code
 *   codeError             - string | null, set after a failed redeemCode attempt
 *   codeSubmitting        - boolean, true while a redeemCode call is in-flight
 *   geofenced             - boolean, true when CMG says this IP is outside the allowed region
 *   geofenceMessage       - string | null
 *   geofenceChecking      - boolean, true while the initial anonymous geofence probe is in-flight
 *   isLoading             - boolean (true during login/logout)
 *   error                 - string | null
 *   login(returnTo)       - redirects to App ID for authentication
 *   handleCallback()      - processes the redirect callback, returns { success, autoProvisioned }
 *   redeemCode(code)      - submits an access code; resolves { success, geofenced, unavailable }
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
  const [codeRequired, setCodeRequired] = useState(false);
  const [codeError, setCodeError] = useState(null);
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Stable SDK client instances — created once, never recreated.
  const cmg = useMemo(() => new CmgClient({ host: CMG_URL, namespace: SITE_NAMESPACE }), []);
  const auth = useMemo(() => {
    const mode = (import.meta.env.VITE_ROUTER_MODE || 'path').toLowerCase();
    const redirectUri = mode === 'hash'
      ? `${window.location.origin}/`
      : `${window.location.origin}/callback`;
    return new AuthClient({
      authorityUrl: import.meta.env.VITE_APPID_OAUTH_SERVER_URL,
      clientId: import.meta.env.VITE_APPID_CLIENT_ID,
      redirectUri,
      tokenEndpointProxy: `${CMG_URL}/auth/token`,
    });
  }, []);

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
      if (result.codeRequired) {
        setCodeRequired(true);
        setCodeError(null);
        setMembershipStatus('code_required');
      } else {
        setCodeRequired(false);
        setMembershipStatus(result.isMember ? 'member' : 'not_member');
      }
      return { autoProvisioned: !!result.autoProvisioned, hasProfile: !!result.hasProfile };
    } catch (err) {
      console.error('AuthProvider: membership validation error', err);
      setIsMember(false);
      setAutoProvisioned(false);
      setRoles([]);
      setGeofenced(false);
      setGeofenceMessage(null);
      setCodeRequired(false);
      setMembershipStatus('error');
      return { autoProvisioned: false, hasProfile: false };
    }
  }, [cmg]);

  // Bootstrap: rehydrate auth state from sessionStorage on mount.
  // Covers two cases: (1) full-page reload after OAuth callback,
  // (2) user hard-refreshes while signed in.
  // oidc-client-ts persists the OIDC user to sessionStorage automatically;
  // we just need to read it and repopulate React state.
  // NOTE: must be declared AFTER validateMembership to avoid TDZ error.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const oidcUser = await auth.getUser();
      if (cancelled || !oidcUser || oidcUser.expired) return;
      const p = oidcUser.profile;
      setUser({
        uid: p.sub,
        email: p.email ?? '',
        firstName: p.given_name ?? p.name?.split(' ')[0] ?? '',
        lastName: p.family_name ?? p.name?.split(' ').slice(1).join(' ') ?? '',
        idToken: oidcUser.id_token,
        accessToken: oidcUser.access_token,
        raw: p,
      });
      sessionStorage.setItem('cam_token', oidcUser.id_token);
      sessionStorage.setItem('cam_access_token', oidcUser.access_token);
      await validateMembership(oidcUser.id_token);
    })();
    return () => { cancelled = true; };
  }, [auth, validateMembership]);

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

  const redeemCode = useCallback(async (code) => {
    const idToken = user?.idToken;
    if (!idToken) return { success: false, unavailable: false, geofenced: false };
    setCodeSubmitting(true);
    setCodeError(null);
    try {
      const result = await cmg.redeemCode({ idToken, code });
      if (result.isMember) {
        setIsMember(true);
        setAutoProvisioned(result.autoProvisioned);
        setRoles(result.roles);
        setCodeRequired(false);
        setCodeError(null);
        setMembershipStatus('member');
        return { success: true, geofenced: false, unavailable: false };
      }
      if (result.geofenced) {
        setGeofenced(true);
        setGeofenceMessage(result.geofenceMessage);
        setCodeRequired(false);
        setMembershipStatus('not_member');
        return { success: false, geofenced: true, unavailable: false };
      }
      // invalid_code or other 400 — keep code_required state, surface generic error
      setCodeError('The code you entered is invalid or has expired. Please try again.');
      return { success: false, geofenced: false, unavailable: false };
    } catch (err) {
      // 503 or network failure
      console.error('AuthProvider: redeemCode error', err);
      setCodeError('The access code service is temporarily unavailable. Please try again later.');
      return { success: false, geofenced: false, unavailable: true };
    } finally {
      setCodeSubmitting(false);
    }
  }, [cmg, user]);

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
    setCodeRequired(false);
    setCodeError(null);
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
      codeRequired,
      codeError,
      codeSubmitting,
      isLoading,
      error,
      login,
      handleCallback,
      redeemCode,
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
