import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

/**
 * AccessCodeChallenge — renders a code-entry form when the namespace requires an access code.
 *
 * Reads `codeRequired`, `codeError`, `codeSubmitting`, and `redeemCode` from AuthContext;
 * returns null when no code is required (safe to mount unconditionally in a gate component).
 *
 * All user-facing text is overridable via props so any site can adopt the component without
 * forking it.
 *
 * @param {string}  [title]         - Card heading.
 * @param {string}  [description]   - Body copy beneath the heading.
 * @param {string}  [placeholder]   - Input placeholder text.
 * @param {string}  [submitLabel]   - Submit button label.
 * @param {string}  [successMessage] - Screen-reader-only status after success (brief).
 * @param {Function} [onSuccess]    - Optional callback fired after successful redemption.
 */
export default function AccessCodeChallenge({
  title = 'Enter your access code',
  description = 'This area is available to members with an access code. Enter yours below to continue.',
  placeholder = 'Access code',
  submitLabel = 'Submit',
  successMessage = 'Access granted.',
  onSuccess,
}) {
  const { codeRequired, codeError, codeSubmitting, redeemCode } = useAuth();
  const [code, setCode] = useState('');

  if (!codeRequired) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    const result = await redeemCode(trimmed);
    if (result.success) {
      onSuccess?.();
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-background px-4 py-12">
      <div className="bg-card rounded-2xl shadow-xl border border-border p-8 sm:p-10 w-full max-w-md text-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-7 h-7 sm:w-8 sm:h-8 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
        </div>

        <h1 className="text-xl sm:text-2xl font-black text-foreground mb-2">{title}</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mb-8 leading-relaxed">{description}</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={placeholder}
              disabled={codeSubmitting}
              autoComplete="off"
              spellCheck={false}
              aria-label={placeholder}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />

            {codeError && (
              <p role="alert" className="text-destructive text-xs text-left px-1">
                {codeError}
              </p>
            )}

            <button
              type="submit"
              disabled={codeSubmitting || !code.trim()}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {codeSubmitting ? (
                <>
                  <span
                    className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                    aria-hidden="true"
                  />
                  <span>Verifying…</span>
                </>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </form>

        {/* Screen-reader live region for success announcement */}
        <p className="sr-only" role="status" aria-live="polite">
          {!codeRequired ? successMessage : ''}
        </p>
      </div>
    </div>
  );
}
