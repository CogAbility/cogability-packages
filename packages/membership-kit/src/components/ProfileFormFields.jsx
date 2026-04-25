/**
 * Shared form primitives used by both OnboardingPage and ProfilePage.
 */
import { useSiteConfig } from '../config/SiteConfigContext';

export function emptyChild() {
  return { name: '', gender: '', birthMonth: '', birthDay: '', birthYear: '' };
}

export function FormField({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-foreground mb-1.5">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function fieldClass(error) {
  return [
    'w-full px-3 py-2 rounded-xl border text-sm text-foreground bg-card',
    'focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow',
    error ? 'border-destructive' : 'border-border',
  ].join(' ');
}

export function ChildForm({ index, child, errors = {}, showRemove, onChange, onRemove }) {
  const { onboarding: c } = useSiteConfig();
  const heading = index === 0 ? c.childInfoHeading : c.childNHeadingTemplate.replace('{n}', index + 1);

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground text-sm">{heading}</h3>
        {showRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-destructive hover:underline font-semibold"
          >
            {c.removeChildLabel}
          </button>
        )}
      </div>

      <FormField label={c.childNameLabel} required error={errors[`name_${index}`]}>
        <input
          type="text"
          value={child.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder={c.childNamePlaceholder}
          className={fieldClass(errors[`name_${index}`])}
        />
      </FormField>

      <FormField label={c.genderLabel}>
        <select
          value={child.gender}
          onChange={(e) => onChange('gender', e.target.value)}
          className={fieldClass()}
        >
          <option value="">{c.genderPlaceholder}</option>
          {c.genderOptions.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </FormField>

      <div>
        <label className="block text-xs font-semibold text-foreground mb-1.5">
          {c.birthdayLabel} <span className="text-muted-foreground font-normal">{c.birthdayOptional}</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <select
            value={child.birthMonth}
            onChange={(e) => onChange('birthMonth', e.target.value)}
            className={fieldClass()}
            aria-label="Birth month"
          >
            <option value="">{c.monthPlaceholder}</option>
            {c.monthOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            type="number"
            value={child.birthDay}
            onChange={(e) => onChange('birthDay', e.target.value)}
            placeholder={c.dayPlaceholder}
            min="1"
            max="31"
            className={fieldClass()}
            aria-label="Birth day"
          />
          <input
            type="number"
            value={child.birthYear}
            onChange={(e) => onChange('birthYear', e.target.value)}
            placeholder={c.yearPlaceholder}
            min="2000"
            max={new Date().getFullYear()}
            className={fieldClass()}
            aria-label="Birth year"
          />
        </div>
      </div>
    </div>
  );
}
