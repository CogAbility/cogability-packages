import { useAuth } from './AuthProvider';
import LoginPage from '../pages/LoginPage';

/**
 * Renders children only when the user is authenticated.
 * Otherwise renders the login page inline.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return children;
}
