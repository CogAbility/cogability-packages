import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useSiteConfig } from '../config/SiteConfigContext';

export default function AccessDenied({ reason, variant }) {
  const { accessDenied: c } = useSiteConfig();
  const { user, logout } = useAuth();
  const isGeofenced = variant === 'geofenced';

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-background px-4 py-12">
      <div className="bg-card rounded-2xl shadow-xl border border-border p-8 sm:p-10 w-full max-w-md text-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
          {isGeofenced ? (
            <svg className="w-7 h-7 sm:w-8 sm:h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ) : (
            <svg className="w-7 h-7 sm:w-8 sm:h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          )}
        </div>

        <h1 className="text-xl sm:text-2xl font-black text-foreground mb-2">
          {isGeofenced ? c.geofencedHeading : c.restrictedHeading}
        </h1>

        {user && (
          <p className="text-xs text-muted-foreground mb-4">{c.signedInAsPrefix} {user.email}</p>
        )}

        <p className="text-muted-foreground text-xs sm:text-sm mb-8 leading-relaxed">
          {reason || c.defaultReason}
        </p>

        <div className="flex flex-col gap-3">
          <Link to="/" className="btn-primary w-full text-center py-3">
            {c.homeLabel}
          </Link>
          <button
            onClick={logout}
            className="inline-flex items-center justify-center w-full px-6 py-3 rounded-full border-2 border-primary text-primary font-bold text-sm transition-all duration-200 hover:bg-primary hover:text-white"
          >
            {c.signOutLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
