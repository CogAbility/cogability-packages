import { useCallback } from 'react';
import { useAuth } from './AuthProvider';

/**
 * Returns the current user's membership status and roles from AuthContext.
 *
 * Previously this hook made its own duplicate /auth/validate call to CMG.
 * Now it reads the values already resolved by AuthProvider.handleCallback(),
 * eliminating the redundant network request. The CmgClient instance is still
 * available via auth.cmg for any additional CMG calls (e.g. admin operations).
 *
 * Returns:
 *   isValidating    - true while the CMG membership check is in-flight
 *   validationError - string | null
 *   isMember        - boolean
 *   roles           - { namespace, name, display_name }[]
 *   hasRole(r)      - boolean helper; accepts "name" or "namespace:name"
 *   geofenced       - boolean
 *   geofenceMessage - string | null
 */
export function useAuthorization() {
  const {
    membershipStatus,
    isMember,
    roles,
    geofenced,
    geofenceMessage,
  } = useAuth();

  const isValidating = membershipStatus === 'checking';
  const validationError = !isMember && membershipStatus === 'not_member'
    ? (geofenced
        ? (geofenceMessage || 'This service is not available in your area.')
        : 'Your account is not authorized for this site. Please contact an administrator.')
    : membershipStatus === 'error'
    ? 'Authorization check failed.'
    : null;

  const hasRole = useCallback(
    (role) => roles.some((r) => r.name === role || `${r.namespace}:${r.name}` === role),
    [roles]
  );

  return { isValidating, validationError, isMember, roles, hasRole, geofenced, geofenceMessage };
}
