import { FormField, fieldClass } from '../ProfileFormFields';
import { evaluateShowWhen } from './validateProfile';

const _warnedSectionTypes = new Set();
const _warnedFieldTypes = new Set();

const KNOWN_SECTION_TYPES = new Set(['object', 'list']);
const KNOWN_FIELD_TYPES = new Set(['text', 'textarea', 'date', 'number', 'select', 'multiselect', 'boolean']);

function normalizeSectionType(st) {
  if (!KNOWN_SECTION_TYPES.has(st)) {
    if (!_warnedSectionTypes.has(st)) {
      console.warn(`DynamicProfileForm: unknown section_type "${st}", rendering as object`);
      _warnedSectionTypes.add(st);
    }
    return 'object';
  }
  return st;
}

function normalizeFieldType(ft) {
  if (!KNOWN_FIELD_TYPES.has(ft)) {
    if (!_warnedFieldTypes.has(ft)) {
      console.warn(`DynamicProfileForm: unknown field_type "${ft}", rendering as text`);
      _warnedFieldTypes.add(ft);
    }
    return 'text';
  }
  return ft;
}

function FieldInput({ field, scopeValues, value, onChange, error }) {
  if (field.show_when && !evaluateShowWhen(field.show_when, scopeValues ?? {})) {
    return null;
  }

  const ft = normalizeFieldType(field.field_type ?? 'text');
  const cls = fieldClass(error);

  if (ft === 'boolean') {
    return (
      <div>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary/30"
          />
          <span>
            {field.label}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </span>
        </label>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  let inputEl;

  switch (ft) {
    case 'textarea':
      inputEl = (
        <textarea
          rows={3}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      );
      break;

    case 'date':
      inputEl = (
        <input
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      );
      break;

    case 'number':
      inputEl = (
        <input
          type="number"
          value={value ?? ''}
          min={field.min_value}
          max={field.max_value}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={cls}
        />
      );
      break;

    case 'select':
      inputEl = (
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        >
          <option value="">—</option>
          {(field.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
      break;

    case 'multiselect': {
      const selected = Array.isArray(value) ? value : [];
      inputEl = (
        <div className="space-y-1">
          {(field.options || []).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt.value]
                    : selected.filter((v) => v !== opt.value);
                  onChange(next);
                }}
                className="rounded border-border text-primary focus:ring-primary/30"
              />
              {opt.label}
            </label>
          ))}
        </div>
      );
      break;
    }

    default:
      inputEl = (
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      );
  }

  return (
    <FormField label={field.label} required={field.required} error={error}>
      {inputEl}
    </FormField>
  );
}

function ObjectSection({ section, value, onChange, errors }) {
  const sv = value[section.key] || {};

  function patchField(fieldKey, next) {
    onChange({ ...value, [section.key]: { ...sv, [fieldKey]: next } });
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
      <h2 className="font-black text-foreground text-sm">{section.label}</h2>
      {(section.fields || []).map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          scopeValues={sv}
          value={sv[field.key]}
          onChange={(v) => patchField(field.key, v)}
          error={errors[`${section.key}.${field.key}`]}
        />
      ))}
    </div>
  );
}

function ListSection({ section, value, onChange, errors }) {
  const items = value[section.key] || [];

  function patchItems(next) {
    onChange({ ...value, [section.key]: next });
  }

  const canAdd = section.max_items == null || items.length < section.max_items;

  function canRemove(len) {
    if (section.min_items === 0) return true;
    if (section.min_items != null && len <= section.min_items) return false;
    if (len === 1) return false;
    return true;
  }

  return (
    <div className="space-y-4">
      <h2 className="font-black text-foreground text-sm px-1">{section.label}</h2>
      {errors[section.key] && (
        <p className="text-xs text-destructive px-1">{errors[section.key]}</p>
      )}
      {items.map((item, i) => {
        const title =
          section.item_label_field && item[section.item_label_field]
            ? item[section.item_label_field]
            : `Item ${i + 1}`;
        return (
          <div key={i} className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground text-sm">{title}</h3>
              {canRemove(items.length) && (
                <button
                  type="button"
                  onClick={() => patchItems(items.filter((_, idx) => idx !== i))}
                  className="text-xs text-destructive hover:underline font-semibold"
                >
                  Remove
                </button>
              )}
            </div>
            {(section.fields || []).map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                scopeValues={item}
                value={item[field.key]}
                onChange={(v) =>
                  patchItems(items.map((it, idx) => (idx === i ? { ...it, [field.key]: v } : it)))
                }
                error={errors[`${section.key}[${i}].${field.key}`]}
              />
            ))}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => patchItems([...items, {}])}
        disabled={!canAdd}
        className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Add {section.label}
      </button>
    </div>
  );
}

export default function DynamicProfileForm({ schema, value, onChange, errors = {} }) {
  if (!schema?.sections) return null;

  return (
    <div className="space-y-8">
      {schema.sections.map((section) => {
        const st = normalizeSectionType(section.section_type ?? 'object');
        if (st === 'list') {
          return (
            <ListSection
              key={section.key}
              section={section}
              value={value}
              onChange={onChange}
              errors={errors}
            />
          );
        }
        return (
          <ObjectSection
            key={section.key}
            section={section}
            value={value}
            onChange={onChange}
            errors={errors}
          />
        );
      })}
    </div>
  );
}
