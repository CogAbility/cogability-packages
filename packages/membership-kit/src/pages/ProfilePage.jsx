import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useSiteConfig } from '../config/SiteConfigContext';
import { emptyChild, FormField, fieldClass, ChildForm } from '../components/ProfileFormFields';
import { cam } from '../services/buddyApi';
import DynamicProfileForm, { validateProfile } from '../components/DynamicProfileForm';

const APPID_OAUTH_URL = import.meta.env.VITE_APPID_OAUTH_SERVER_URL || '';
const APPID_CLIENT_ID = import.meta.env.VITE_APPID_CLIENT_ID || '';

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function ProfilePage() {
  const { profile: c, onboarding: oc } = useSiteConfig();
  const { user, cmg } = useAuth();

  const [parentData, setParentData] = useState(() =>
    loadFromStorage(`profile_parent_${user?.uid}`, {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
    })
  );

  const [childrenData, setChildrenData] = useState(() =>
    loadFromStorage(`profile_children_${user?.uid}`, [emptyChild()])
  );

  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(null);

  const [schema, setSchema] = useState(null);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [dynamicValue, setDynamicValue] = useState({});

  useEffect(() => {
    let cancelled = false;
    const fetcher =
      typeof cam?.fetchProfileSchema === 'function'
        ? cam.fetchProfileSchema()
        : Promise.resolve(null);
    fetcher
      .then((s) => { if (!cancelled) setSchema(s); })
      .catch((err) => { console.warn('ProfilePage: fetchProfileSchema failed', err); })
      .finally(() => { if (!cancelled) setSchemaLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!schemaLoaded || !schema) return;
    const v = {};
    for (const section of schema.sections || []) {
      try {
        const raw = localStorage.getItem(`profile_${section.key}_${user?.uid}`);
        if (raw) v[section.key] = JSON.parse(raw);
      } catch {
        // ignore malformed localStorage entries
      }
    }
    setDynamicValue(v);
  }, [schemaLoaded, schema, user?.uid]);

  function validate() {
    const e = {};
    if (!parentData.firstName.trim()) e.firstName = oc.firstNameRequired;
    childrenData.forEach((child, i) => {
      if (!child.name.trim()) e[`name_${i}`] = oc.childNameRequired;
    });
    return e;
  }

  function updateChild(index, field, value) {
    setChildrenData((prev) =>
      prev.map((child, i) => (i === index ? { ...child, [field]: value } : child))
    );
  }

  function addChild() {
    setChildrenData((prev) => [...prev, emptyChild()]);
  }

  function removeChild(index) {
    setChildrenData((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    let ok, errs;
    if (schema) {
      ({ ok, errors: errs } = validateProfile(schema, dynamicValue));
    } else {
      errs = validate();
      ok = Object.keys(errs).length === 0;
    }

    if (!ok) { setErrors(errs); return; }
    setErrors({});
    setIsSaving(true);
    setSavedMessage(null);

    if (user?.uid) {
      if (schema) {
        for (const section of schema.sections || []) {
          const sv = dynamicValue[section.key];
          if (sv != null) {
            localStorage.setItem(`profile_${section.key}_${user.uid}`, JSON.stringify(sv));
          }
        }
      } else {
        localStorage.setItem(`profile_parent_${user.uid}`, JSON.stringify(parentData));
        localStorage.setItem(`profile_children_${user.uid}`, JSON.stringify(childrenData));
      }
    }

    try {
      const profilePayload = schema
        ? dynamicValue
        : { parent: parentData, children: childrenData };
      await cmg.saveProfile(user?.idToken, profilePayload);
      setSavedMessage(c.savedMessage);
      setTimeout(() => setSavedMessage(null), 4000);
    } catch (err) {
      console.error('ProfilePage: failed to update profile', err);
      setSavedMessage(c.saveErrorMessage || 'Save failed — please try again.');
      setTimeout(() => setSavedMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  }

  const isCloudDirectoryUser = user?.raw?.identities?.some(
    (id) => id.provider === 'cloud_directory'
  );

  const changePasswordUrl = isCloudDirectoryUser && APPID_OAUTH_URL && APPID_CLIENT_ID
    ? `${APPID_OAUTH_URL}/cloud_directory/change_password?client_id=${APPID_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + '/callback')}`
    : null;

  return (
    <div className="min-h-[80vh] bg-background px-4 pt-20 pb-10">
      <div className="max-w-lg mx-auto space-y-6">

        <div className="flex items-center gap-3">
          <Link
            to="/members"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={c.backAriaLabel}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="font-black text-foreground text-xl">{c.heading}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{c.subheading}</p>
          </div>
        </div>

        {savedMessage && (
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-semibold">
            {savedMessage}
          </div>
        )}

        {schemaLoaded && schema ? (
          <DynamicProfileForm
            schema={schema}
            value={dynamicValue}
            onChange={setDynamicValue}
            errors={errors}
          />
        ) : (
          <>
            <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <h2 className="font-black text-foreground text-sm">{c.yourInfoHeading}</h2>

              <FormField label={oc.firstNameLabel} required error={errors.firstName}>
                <input
                  type="text"
                  value={parentData.firstName}
                  onChange={(e) => setParentData({ ...parentData, firstName: e.target.value })}
                  placeholder={oc.firstNamePlaceholder}
                  className={fieldClass(errors.firstName)}
                />
              </FormField>

              <FormField label={oc.lastNameLabel}>
                <input
                  type="text"
                  value={parentData.lastName}
                  onChange={(e) => setParentData({ ...parentData, lastName: e.target.value })}
                  placeholder={oc.lastNamePlaceholder}
                  className={fieldClass()}
                />
              </FormField>
            </div>

            <div className="space-y-4">
              <h2 className="font-black text-foreground text-sm px-1">{c.childrenHeading}</h2>

              {childrenData.map((child, index) => (
                <ChildForm
                  key={index}
                  index={index}
                  child={child}
                  errors={errors}
                  showRemove={childrenData.length > 1}
                  onChange={(field, value) => updateChild(index, field, value)}
                  onRemove={() => removeChild(index)}
                />
              ))}

              <button
                type="button"
                onClick={addChild}
                className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                {oc.addChildLabel}
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary w-full py-3 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              {c.savingLabel}
            </>
          ) : (
            c.saveLabel
          )}
        </button>

        {changePasswordUrl && (
          <div className="bg-card rounded-2xl border border-border p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-foreground">{c.changePasswordLabel}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.changePasswordSub}</p>
            </div>
            <a
              href={changePasswordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-xs px-4 py-2 flex-shrink-0"
            >
              {c.changePasswordLabel}
            </a>
          </div>
        )}

        <div className="text-center">
          <Link
            to="/members"
            className="text-sm text-muted-foreground hover:text-foreground font-semibold transition-colors"
          >
            {c.backLabel}
          </Link>
        </div>

      </div>
    </div>
  );
}
