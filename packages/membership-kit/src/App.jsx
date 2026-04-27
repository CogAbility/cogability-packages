import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { SiteConfigProvider, useSiteConfig } from './config/SiteConfigContext';
import ProtectedRoute from './auth/ProtectedRoute';
import RoleGate from './auth/RoleGate';
import DefaultHeader from './components/Header';
import DefaultFooter from './components/Footer';
import DefaultLandingPage from './pages/LandingPage';
import DefaultMembersPage from './pages/MembersPage';
import DefaultCallbackPage from './pages/CallbackPage';
import DefaultOnboardingPage from './pages/OnboardingPage';
import DefaultProfilePage from './pages/ProfilePage';

const ROUTER_MODE = (import.meta.env.VITE_ROUTER_MODE || 'path').toLowerCase();
const Router = ROUTER_MODE === 'hash' ? HashRouter : BrowserRouter;

function hasOAuthParamsInUrl() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}

/**
 * Hash-mode OAuth landing page.
 *
 * In hash mode the OAuth provider redirects users back to the site root
 * (e.g. https://example.com/?code=...&state=...) because the static host
 * cannot serve a /callback path on hosts without SPA fallback (Lovable
 * *.lovable.app, GitHub Pages without 404.html hack).
 *
 * This component runs INSTEAD of the router on first paint when OAuth params
 * are detected. It finishes the OIDC handshake via AuthContext.handleCallback()
 * then calls onComplete(target) so the parent can switch to the Router without
 * a full-page reload, preserving React auth state across the transition.
 */
function RootOAuthLanding({ onComplete }) {
  const { handleCallback } = useAuth();
  const { callback } = useSiteConfig();
  const calledRef = useRef(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    handleCallback().then((result) => {
      if (!result.success) {
        setError('Sign-in failed. Please try again.');
        return;
      }
      const returnTo = sessionStorage.getItem('auth_return_to') || '/members';
      sessionStorage.removeItem('auth_return_to');
      const target = (result.autoProvisioned && !result.hasProfile) ? '/onboarding' : returnTo;
      onComplete(target);
    });
  }, [handleCallback, onComplete]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-muted-foreground text-sm mb-4">{error}</p>
            <button
              type="button"
              className="text-primary underline text-sm"
              onClick={() => window.location.replace('/')}
            >
              Return home
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">{callback?.loadingLabel ?? 'Signing you in…'}</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Main application shell. Accepts a site config object and optional
 * component overrides for per-deployer customization.
 *
 * Routing mode is controlled by VITE_ROUTER_MODE (default: "path"):
 *   - "path" → BrowserRouter, OAuth redirect_uri = origin + "/callback".
 *     For hosts that do SPA fallback (Vercel, Netlify, Cloudflare, custom CDN).
 *   - "hash" → HashRouter, OAuth redirect_uri = origin + "/".
 *     For hosts that don't do SPA fallback (Lovable *.lovable.app,
 *     GitHub Pages without 404.html hack). The kit detects ?code=&state=
 *     at the site root and finishes the OIDC handshake before routing.
 *
 * @param {object} config - The site configuration (from site.config.js)
 * @param {object} [overrides] - Optional map of component overrides:
 *   { Header, Footer, LandingPage, MembersPage, CallbackPage, OnboardingPage, ProfilePage }
 */
export default function App({ config, overrides = {} }) {
  const Header = overrides.Header || DefaultHeader;
  const Footer = overrides.Footer || DefaultFooter;
  const Landing = overrides.LandingPage || DefaultLandingPage;
  const Members = overrides.MembersPage || DefaultMembersPage;
  const Callback = overrides.CallbackPage || DefaultCallbackPage;
  const Onboarding = overrides.OnboardingPage || DefaultOnboardingPage;
  const Profile = overrides.ProfilePage || DefaultProfilePage;

  // Track whether RootOAuthLanding has already finished. After it completes
  // it calls onComplete which flips this flag and switches to the Router
  // WITHOUT a full-page reload, preserving React auth state.
  const [oauthHandled, setOauthHandled] = useState(false);
  const isHashOAuthLanding = ROUTER_MODE === 'hash' && hasOAuthParamsInUrl() && !oauthHandled;

  const handleOAuthComplete = (target) => {
    // Strip query params without reloading — gives HashRouter a clean URL.
    window.history.replaceState({}, '', '/#' + target);
    setOauthHandled(true);
  };

  return (
    <SiteConfigProvider config={config}>
      <AuthProvider>
        {isHashOAuthLanding ? (
          <RootOAuthLanding onComplete={handleOAuthComplete} />
        ) : (
          <Router>
            <div className="flex flex-col min-h-screen">
              <Header />
              <div className="flex-1">
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route
                    path="/members"
                    element={
                      <ProtectedRoute>
                        <RoleGate requiredRole="member">
                          <Members />
                        </RoleGate>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/callback" element={<Callback />} />
                  <Route
                    path="/onboarding"
                    element={
                      <ProtectedRoute>
                        <Onboarding />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <RoleGate requiredRole="member">
                          <Profile />
                        </RoleGate>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Landing />} />
                </Routes>
              </div>
              <Footer />
            </div>
          </Router>
        )}
      </AuthProvider>
    </SiteConfigProvider>
  );
}
