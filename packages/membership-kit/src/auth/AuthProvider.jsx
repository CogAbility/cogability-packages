import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
 *   sessionExpiredReason  - 'idle' | 'absolute' | null, set once the SDK ends the session out
 *                           from under the user (idle timeout or absolute cap), so the UI can
 *                           distinguish "you signed out" from "you were signed out". Cleared on
 *                           the next successful sign-in.
 *   login(returnTo)       - redirects to App ID for authentication
 *   handleCallback()      - processes the redirect callback, returns { success, autoProvisioned }
 *   redeemCode(code)      - submits an access code; resolves { success, geofenced, unavailable }
 *   logout()              - clears session
 *   markProfileSaved()    - flips hasProfile to true after the onboarding wizard saves
 *   cmg                   - CmgClient instance (available to child hooks via useAuth())
 *
 * Props:
 *   persistSession      - defaults to true, keeping the login in localStorage so it
 *                         survives a tab close. Pass false for a tab-scoped session.
 *   idleTimeoutMinutes  - forwarded to AuthClient; omit to keep the SDK default (30, 0 disables).
 *   absoluteCapHours    - forwarded to AuthClient; omit to keep the SDK default (12, 0 disables).
 */
const AuthContext = createContext(null);

const CMG_URL = import.meta.env.VITE_CMG_URL || 'http://localhost:3010';
const SITE_NAMESPACE = import.meta.env.VITE_SITE_NAMESPACE || 'bab';

export function AuthProvider({ children, persistSession = true, idleTimeoutMinutes, absoluteCapHours }) {
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
  const [sessionExpiredReason, setSessionExpiredReason] = useState(null);

  // Stable SDK client instances — created once, never recreated.
  const cmg = useMemo(() => new CmgClient({ host: CMG_URL, namespace: SITE_NAMESPACE }), []);

  // The AuthClient is memoized on [persistSession] alone, so it survives
  // unrelated re-renders. onSessionExpired must therefore never close over
  // this render's state directly — it reads through a ref that a separate
  // effect keeps pointed at the latest handler, so the callback the SDK
  // holds is always fresh without ever forcing the client to be rebuilt.
  const onSessionExpiredRef = useRef(() => {});
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
      // On by default: App ID issues no refresh tokens to SPA clients, so a
      // tab-scoped session means re-running email MFA on every visit.
      persistSession,
      idleTimeoutMinutes,
      absoluteCapHours,
      onSessionExpired: (reason) => onSessionExpiredRef.current(reason),
    });
  }, [persistSession, idleTimeoutMinutes, absoluteCapHours]);

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
      return {
        isMember: !!result.isMember,
        autoProvisioned: !!result.autoProvisioned,
        hasProfile: !!result.hasProfile,
      };
    } catch (err) {
      console.error('AuthProvider: membership validation error', err);
      setIsMember(false);
      setAutoProvisioned(false);
      setRoles([]);
      setGeofenced(false);
      setGeofenceMessage(null);
      setCodeRequired(false);
      setMembershipStatus('error');
      return { isMember: false, autoProvisioned: false, hasProfile: false };
    }
  }, [cmg]);

  // Onboarding writes a profile and needs the context to reflect that
  // immediately, otherwise the /members onboarding guard (which redirects
  // whenever hasProfile is false) would bounce the user straight back to
  // /onboarding after a successful save.
  const markProfileSaved = useCallback(() => {
    setHasProfile(true);
  }, []);

  // Drops the app-level copies of the tokens that useBuddyChat and buddyApi
  // read directly.
  //
  // Deliberately does NOT touch `auth_return_to`. That is navigation intent
  // rather than a credential: it is written before the App ID redirect and read
  // back only once handleCallback() resolves. Clearing it here would race that
  // read on every single login, because the bootstrap getUser() below is a
  // local storage lookup that settles long before the token exchange returns —
  // quietly sending every member to /members instead of the page they asked
  // for. Only logout() clears it.
  //
  // Declared up here, ahead of the bootstrap effect that lists it in its
  // dependency array: a useCallback declared further down would be in its TDZ
  // when this render evaluates that array, which is the same trap the
  // bootstrap NOTE below refers to.
  const clearTokenMirror = useCallback(() => {
    sessionStorage.removeItem('cam_token');
    sessionStorage.removeItem('cam_access_token');
  }, []);

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
      if (cancelled) return;
      if (!oidcUser || oidcUser.expired) {
        // No usable session, so the mirrored tokens must go too. getUser()'s
        // own expiry path only reports sessions it actually removed, and the
        // mirror is per-tab while the OIDC session is shared: a second tab
        // reloading after another tab timed out sees no stored user, gets no
        // callback, and would otherwise keep handing its stale cam_token to
        // useBuddyChat and buddyApi, which read that key directly.
        clearTokenMirror();
        return;
      }
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
  }, [auth, validateMembership, clearTokenMirror]);

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
      // A fresh sign-in supersedes whatever ended the previous session.
      setSessionExpiredReason(null);

      const { isMember, autoProvisioned: wasAutoProvisioned, hasProfile } = await validateMembership(idToken);
      return { success: true, isMember, autoProvisioned: wasAutoProvisioned, hasProfile };
    } catch (err) {
      console.error('AuthProvider: callback error', err);
      setError(err?.message || 'Login failed. Please try again.');
      return { success: false, isMember: false, autoProvisioned: false, hasProfile: false };
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
      // invalid_code or other 400 — keep code_required state. `wrong_product` is the one
      // failure CMG intentionally makes non-generic (the code is valid but belongs to a
      // different cogbot), so surface its message verbatim; everything else stays generic
      // to resist code enumeration.
      setCodeError(
        result.error === 'wrong_product' && result.message
          ? result.message
          : 'The code you entered is invalid or has expired. Please try again.'
      );
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

  // The other half of teardown, shared by logout() and the SDK's
  // onSessionExpired callback so the two paths cannot drift apart. Kept
  // separate from clearTokenMirror because onSessionExpired fires *after* the
  // SDK has already cleared the OIDC session — it must never call
  // auth.logout() itself, which would try to clear an already-cleared session
  // and stop an already-stopped monitor — while logout() still owns that part.
  const resetAuthState = useCallback(() => {
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
  }, []);

  const logout = useCallback(async () => {
    clearTokenMirror();
    // Only a deliberate sign-out discards where the user was headed. An idle
    // or capped-out session keeps it, so re-authenticating returns them to the
    // page they were on rather than dumping them at /members.
    sessionStorage.removeItem('auth_return_to');
    await auth.logout();
    resetAuthState();
  }, [auth, clearTokenMirror, resetAuthState]);

  // Kept in sync with the latest render on every render (deliberately not
  // memoized), and read only through onSessionExpiredRef from inside the
  // AuthClient's callback. This is what lets the callback passed into the
  // useMemo above stay pointed at fresh state/closures without the useMemo
  // itself ever depending on — and being torn down by — this handler.
  const handleSessionExpired = (reason) => {
    clearTokenMirror();
    resetAuthState();
    setSessionExpiredReason(reason);
  };
  useEffect(() => {
    onSessionExpiredRef.current = handleSessionExpired;
  });

  // Start the SDK's own activity monitor while a user is signed in, so an
  // idle tab is actually terminated instead of only failing on the next
  // token read. AuthClient owns the listeners; this only calls start/stop.
  // The guard inside startActivityMonitor() makes calling it twice a no-op,
  // and stop() on an already-stopped monitor is also a no-op, so this is
  // safe under React 19 StrictMode's mount → cleanup → mount double-invoke.
  // startActivityMonitor only exists from sdk@0.9.1 onward, yet this kit's
  // "^0.9.0" dependency also resolves the 0.9.0 that predates it — a caret on
  // a 0.x version spans every patch. Degrade rather than throw when they skew:
  // without the monitor an idle session still ends, just on the next token read
  // via getUser()'s bounds check instead of while the tab sits open. The stop
  // guard covers an SDK that returns nothing from startActivityMonitor().
  useEffect(() => {
    if (!user) return;
    if (typeof auth?.startActivityMonitor !== 'function') {
      console.warn(
        'AuthProvider: the installed @cogability/sdk predates startActivityMonitor(), so idle ' +
        'sessions will only be ended on the next token read instead of while the tab sits idle.'
      );
      return;
    }
    const stop = auth.startActivityMonitor();
    return () => {
      if (typeof stop === 'function') stop();
    };
  }, [user, auth]);

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
      sessionExpiredReason,
      login,
      handleCallback,
      redeemCode,
      logout,
      markProfileSaved,
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
