import { useAuth } from '../auth/AuthProvider';
import { useSiteConfig } from '../config/SiteConfigContext';

export default function LoginPage() {
  const { login: c } = useSiteConfig();
  const { login, isLoading, error } = useAuth();

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-background px-4 py-12">
      <div className="bg-card rounded-2xl shadow-xl border border-border p-8 sm:p-10 w-full max-w-md text-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-6">
          <span className="text-primary-foreground font-black text-2xl">{c.logoInitial}</span>
        </div>

        <h1 className="text-xl sm:text-2xl font-black text-foreground mb-2">{c.heading}</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mb-8">
          {c.subheading}
        </p>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-left">
            <strong>{c.errorPrefix}</strong> {error}
          </div>
        )}

        <button
          onClick={() => login('/members')}
          disabled={isLoading}
          className="btn-primary w-full py-3.5 text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              {c.loadingLabel}
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              {c.buttonLabel}
            </>
          )}
        </button>

        <p className="text-xs text-muted-foreground mt-6 leading-relaxed">
          {c.footerText}
        </p>
      </div>
    </div>
  );
}
