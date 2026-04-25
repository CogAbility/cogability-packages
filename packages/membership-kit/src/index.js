// App shell
export { default as App } from './App';

// Config
export { SiteConfigProvider, useSiteConfig } from './config/SiteConfigContext';

// Auth
export { AuthProvider, useAuth } from './auth/AuthProvider';
export { default as ProtectedRoute } from './auth/ProtectedRoute';
export { default as RoleGate } from './auth/RoleGate';
export { useAuthorization } from './auth/useAuthorization';
// Buddy API
export {
  setAnonymousTokens,
  initCogbot,
  sendMessage,
  sendMessageStream,
  setAuthenticatedTokens,
  sendAuthenticatedMessage,
  sendAuthenticatedMessageStream,
  buildOnboardingMessage,
  parseResponseGeneric,
} from './services/buddyApi';

// Hooks
export { default as useBuddyChat } from './hooks/useBuddyChat';

// Components
export { default as BuddyChat } from './components/BuddyChat';
export { default as CogBotEmbed } from './components/CogBotEmbed';
export { default as Header } from './components/Header';
export { default as Footer } from './components/Footer';
export { default as Hero } from './components/Hero';
export { default as Features } from './components/Features';
export { default as About } from './components/About';
export { default as Testimonials } from './components/Testimonials';
export { default as OnboardingProgressIndicator } from './components/OnboardingProgressIndicator';
export { emptyChild, FormField, fieldClass, ChildForm } from './components/ProfileFormFields';

// Pages (exported for override/customization)
export { default as LoginPage } from './pages/LoginPage';
export { default as AccessDenied } from './pages/AccessDenied';
export { default as LandingPage } from './pages/LandingPage';
export { default as MembersPage } from './pages/MembersPage';
export { default as CallbackPage } from './pages/CallbackPage';
export { default as OnboardingPage } from './pages/OnboardingPage';
export { default as ProfilePage } from './pages/ProfilePage';
