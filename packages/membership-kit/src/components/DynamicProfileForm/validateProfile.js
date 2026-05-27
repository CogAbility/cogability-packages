const _warnedExprs = new Set();

export function evaluateShowWhen(expr, scopeValues) {
  if (!expr) return true;
  const s = scopeValues ?? {};
  const trimmed = expr.trim();

  let m;

  m = trimmed.match(/^(\w+)\s*==\s*'([^']*)'$/);
  if (m) return String(s[m[1]] ?? '') === m[2];

  m = trimmed.match(/^(\w+)\s*!=\s*'([^']*)'$/);
  if (m) return String(s[m[1]] ?? '') !== m[2];

  m = trimmed.match(/^!(\w+)$/);
  if (m) {
    const v = s[m[1]];
    return !v || v === '' || v === false || (Array.isArray(v) && v.length === 0);
  }

  m = trimmed.match(/^(\w+)$/);
  if (m) {
    const v = s[m[1]];
    return !!(v && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0));
  }

  if (!_warnedExprs.has(trimmed)) {
    _warnedExprs.add(trimmed);
    console.warn(`DynamicProfileForm: unable to parse show_when expression: "${trimmed}"`);
  }
  return true;
}

function isEmpty(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

function validateNumberRange(errors, path, fieldValue, field) {
  const num = Number(fieldValue);
  if (isNaN(num)) return;
  const hasMin = field.min_value != null;
  const hasMax = field.max_value != null;
  if (hasMin && hasMax && (num < field.min_value || num > field.max_value)) {
    errors[path] = `Must be between ${field.min_value} and ${field.max_value}`;
  } else if (hasMin && num < field.min_value) {
    errors[path] = `Must be at least ${field.min_value}`;
  } else if (hasMax && num > field.max_value) {
    errors[path] = `Must be at most ${field.max_value}`;
  }
}

function validateField(errors, path, field, fieldValue, scopeValues) {
  if (field.show_when && !evaluateShowWhen(field.show_when, scopeValues)) return;

  if (field.required && isEmpty(fieldValue)) {
    errors[path] = `${field.label || field.key} is required`;
    return;
  }

  if (isEmpty(fieldValue)) return;

  if (field.pattern) {
    try {
      if (!new RegExp(field.pattern).test(String(fieldValue))) {
        errors[path] = 'Invalid format';
        return;
      }
    } catch {
      // malformed regex — skip
    }
  }

  if (field.field_type === 'number') {
    validateNumberRange(errors, path, fieldValue, field);
    return;
  }

  if (field.field_type === 'select' && field.options) {
    if (!field.options.some((o) => o.value === fieldValue)) {
      errors[path] = 'Invalid choice';
      return;
    }
  }

  if (field.field_type === 'multiselect' && field.options && Array.isArray(fieldValue)) {
    const valid = new Set(field.options.map((o) => o.value));
    if (fieldValue.some((v) => !valid.has(v))) {
      errors[path] = 'Invalid choice';
    }
  }
}

export function validateProfile(schema, value) {
  const errors = {};

  if (!schema?.sections) return { ok: true, errors };

  for (const section of schema.sections) {
    const sectionType = section.section_type ?? 'object';

    if (sectionType === 'object' || !['object', 'list'].includes(sectionType)) {
      const sv = value[section.key] || {};
      for (const field of section.fields || []) {
        validateField(errors, `${section.key}.${field.key}`, field, sv[field.key], sv);
      }
    } else if (sectionType === 'list') {
      const items = value[section.key] || [];
      if (section.min_items > 0 && items.length < section.min_items) {
        errors[section.key] = `At least ${section.min_items} required`;
      }
      items.forEach((item, i) => {
        for (const field of section.fields || []) {
          validateField(
            errors,
            `${section.key}[${i}].${field.key}`,
            field,
            item[field.key],
            item,
          );
        }
      });
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
