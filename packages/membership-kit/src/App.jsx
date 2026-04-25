import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { SiteConfigProvider } from './config/SiteConfigContext';
import ProtectedRoute from './auth/ProtectedRoute';
import RoleGate from './auth/RoleGate';
import DefaultHeader from './components/Header';
import DefaultFooter from './components/Footer';
import DefaultLandingPage from './pages/LandingPage';
import DefaultMembersPage from './pages/MembersPage';
import DefaultCallbackPage from './pages/CallbackPage';
import DefaultOnboardingPage from './pages/OnboardingPage';
import DefaultProfilePage from './pages/ProfilePage';

/**
 * Main application shell. Accepts a site config object and optional
 * component overrides for per-deployer customization.
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

  return (
    <SiteConfigProvider config={config}>
      <AuthProvider>
        <BrowserRouter>
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
        </BrowserRouter>
      </AuthProvider>
    </SiteConfigProvider>
  );
}
