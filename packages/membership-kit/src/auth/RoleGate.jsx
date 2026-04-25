import { useAuthorization } from './useAuthorization';
import { useSiteConfig } from '../config/SiteConfigContext';
import AccessDenied from '../pages/AccessDenied';

/**
 * Renders children only when the authenticated user passes CMG validation
 * and (optionally) holds a specific role.
 *
 * @param {string}    [requiredRole] - e.g. "member" or "bab:member"
 * @param {ReactNode} children
 */
export default function RoleGate({ requiredRole, children }) {
  const { roleGate: c } = useSiteConfig();
  const { hasRole, isMember, isValidating, validationError, geofenced, geofenceMessage } = useAuthorization();

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">{c.checkingLabel}</p>
        </div>
      </div>
    );
  }

  if (geofenced) {
    return <AccessDenied reason={geofenceMessage || c.defaultGeofenceMessage} variant="geofenced" />;
  }

  if (validationError || !isMember) {
    return <AccessDenied reason={validationError || c.notMemberMessage} />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return <AccessDenied reason={c.roleRequiredTemplate.replace('{role}', requiredRole)} />;
  }

  return children;
}
