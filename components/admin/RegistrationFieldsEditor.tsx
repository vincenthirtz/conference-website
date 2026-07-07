// components/admin/RegistrationFieldsEditor.tsx
//
// Builder for a tournament's custom registration fields
// (`tournaments.registration_fields`). Controlled component: the parent owns the
// `RegistrationField[]` array and persists it inside the tournament update
// payload. Client-side guardrails here mirror `validateFieldDefinitions`
// (utils/registrationFields.ts) so a save doesn't 400 — but the server stays the
// source of truth.

import { useMemo } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type {
  RegistrationField,
  RegistrationFieldType,
} from '@/utils/registrationFields';

const FIELD_TYPES: RegistrationFieldType[] = [
  'text',
  'textarea',
  'select',
  'checkbox',
  'number',
  'url',
];

const KEY_RE = /^[a-z0-9_]{1,40}$/;
const TEXT_TYPES = new Set<RegistrationFieldType>(['text', 'textarea']);

/** Derive a snake_case key candidate from a human label. */
export function slugifyKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Pure structural check the parent uses to block a save. Mirrors the server's
 * hard rules (charset, uniqueness, non-empty label, select needs an option).
 * Returns true when at least one field is invalid.
 */
export function hasRegistrationFieldErrors(fields: RegistrationField[]): boolean {
  const seen = new Set<string>();
  for (const f of fields) {
    if (!KEY_RE.test(f.key)) return true;
    if (seen.has(f.key)) return true;
    seen.add(f.key);
    const label = (f.label || '').trim();
    if (label.length < 1 || label.length > 80) return true;
    if (f.type === 'select') {
      const opts = (f.options ?? []).filter((o) => o.trim().length > 0);
      if (opts.length < 1) return true;
    }
  }
  return false;
}

type Props = {
  fields: RegistrationField[];
  onChange: (fields: RegistrationField[]) => void;
  disabled?: boolean;
};

function RegistrationFieldsEditor({ fields, onChange, disabled }: Props) {
  const t = useAdminT('adminRegistrationFields');

  const typeName = useMemo(
    (): Record<RegistrationFieldType, string> => ({
      text: t.typeText,
      textarea: t.typeTextarea,
      select: t.typeSelect,
      checkbox: t.typeCheckbox,
      number: t.typeNumber,
      url: t.typeUrl,
    }),
    [t]
  );

  // Per-field error message for inline display (uniqueness is computed here so
  // the second occurrence of a duplicated key is the one flagged).
  const errorsByIndex = useMemo(() => {
    const out: Record<number, string> = {};
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      const label = (f.label || '').trim();
      if (label.length < 1) {
        out[i] = t.errLabelRequired;
        return;
      }
      if (!KEY_RE.test(f.key)) {
        out[i] = t.errKeyInvalid;
        return;
      }
      if (seen.has(f.key)) {
        out[i] = t.errKeyDuplicate;
        return;
      }
      seen.add(f.key);
      if (f.type === 'select') {
        const opts = (f.options ?? []).filter((o) => o.trim().length > 0);
        if (opts.length < 1) {
          out[i] = t.errSelectNeedsOption;
        }
      }
    });
    return out;
  }, [fields, t]);

  function patchField(index: number, patch: Partial<RegistrationField>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function updateLabel(index: number, nextLabel: string) {
    const current = fields[index];
    // Auto-suggest the key from the label as long as the key was never touched
    // manually (i.e. it still equals what the previous label would have made).
    const autoKey =
      current.key === '' || current.key === slugifyKey(current.label);
    const patch: Partial<RegistrationField> = { label: nextLabel };
    if (autoKey) {
      patch.key = slugifyKey(nextLabel);
    }
    patchField(index, patch);
  }

  function updateType(index: number, nextType: RegistrationFieldType) {
    const current = fields[index];
    const patch: Partial<RegistrationField> = { type: nextType };
    if (nextType === 'select' && !current.options) {
      patch.options = [''];
    }
    if (nextType !== 'select') {
      patch.options = undefined;
    }
    if (!TEXT_TYPES.has(nextType)) {
      patch.maxLength = undefined;
    }
    patchField(index, patch);
  }

  function addField() {
    if (fields.length >= 20) return;
    onChange([
      ...fields,
      { key: '', label: '', type: 'text', required: false },
    ]);
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function updateOption(index: number, optIndex: number, value: string) {
    const opts = [...(fields[index].options ?? [])];
    opts[optIndex] = value;
    patchField(index, { options: opts });
  }

  function addOption(index: number) {
    const opts = [...(fields[index].options ?? [])];
    opts.push('');
    patchField(index, { options: opts });
  }

  function removeOption(index: number, optIndex: number) {
    const opts = (fields[index].options ?? []).filter((_, i) => i !== optIndex);
    patchField(index, { options: opts });
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

  return (
    <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <svg
          className="w-5 h-5 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
        {t.sectionTitle}
      </h2>
      <p className="text-xs text-neutral-500 mb-4">{t.sectionDescription}</p>

      {fields.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-700 px-4 py-8 text-center text-sm text-neutral-500">
          {t.emptyState}
        </div>
      )}

      <div className="space-y-4">
        {fields.map((field, index) => {
          const rowError = errorsByIndex[index];
          return (
            <div
              key={index}
              className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  {t.fieldBadge} {index + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                    title={t.moveUp}
                    aria-label={t.moveUp}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700/60 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === fields.length - 1}
                    onClick={() => move(index, 1)}
                    title={t.moveDown}
                    aria-label={t.moveDown}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700/60 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeField(index)}
                    title={t.removeField}
                    aria-label={t.removeField}
                    className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-900/30 disabled:opacity-30"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1 text-neutral-400">
                    {t.labelLabel}
                  </label>
                  <input
                    type="text"
                    className={inputCls}
                    value={field.label}
                    disabled={disabled}
                    maxLength={80}
                    onChange={(e) => updateLabel(index, e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 text-neutral-400">
                    {t.keyLabel}
                  </label>
                  <input
                    type="text"
                    className={`${inputCls} font-mono`}
                    value={field.key}
                    disabled={disabled}
                    maxLength={40}
                    onChange={(e) =>
                      patchField(index, { key: e.target.value })
                    }
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {t.keyHelp}
                  </p>
                </div>

                <div>
                  <label className="block text-xs mb-1 text-neutral-400">
                    {t.typeLabel}
                  </label>
                  <select
                    className={inputCls}
                    value={field.type}
                    disabled={disabled}
                    onChange={(e) =>
                      updateType(index, e.target.value as RegistrationFieldType)
                    }
                  >
                    {FIELD_TYPES.map((ft) => (
                      <option key={ft} value={ft}>
                        {typeName[ft]}
                      </option>
                    ))}
                  </select>
                </div>

                {TEXT_TYPES.has(field.type) && (
                  <div>
                    <label className="block text-xs mb-1 text-neutral-400">
                      {t.maxLengthLabel}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      className={inputCls}
                      value={field.maxLength ?? ''}
                      disabled={disabled}
                      placeholder={t.maxLengthPlaceholder}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        patchField(index, {
                          maxLength: v === '' ? undefined : Number(v),
                        });
                      }}
                    />
                  </div>
                )}

                <div className="md:col-span-2">
                  <label className="block text-xs mb-1 text-neutral-400">
                    {t.helpLabel}
                  </label>
                  <input
                    type="text"
                    className={inputCls}
                    value={field.help ?? ''}
                    disabled={disabled}
                    maxLength={200}
                    placeholder={t.helpPlaceholder}
                    onChange={(e) =>
                      patchField(index, {
                        help: e.target.value === '' ? undefined : e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {field.type === 'select' && (
                <div className="mt-3">
                  <label className="block text-xs mb-1 text-neutral-400">
                    {t.optionsLabel}
                  </label>
                  <div className="space-y-2">
                    {(field.options ?? []).map((opt, optIndex) => (
                      <div key={optIndex} className="flex items-center gap-2">
                        <input
                          type="text"
                          className={inputCls}
                          value={opt}
                          disabled={disabled}
                          maxLength={60}
                          placeholder={t.optionPlaceholder}
                          onChange={(e) =>
                            updateOption(index, optIndex, e.target.value)
                          }
                        />
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => removeOption(index, optIndex)}
                          title={t.removeOption}
                          aria-label={t.removeOption}
                          className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-900/30 disabled:opacity-30 flex-shrink-0"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => addOption(index)}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-30"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    {t.addOption}
                  </button>
                </div>
              )}

              <label className="flex items-center gap-2 mt-3 text-sm text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-neutral-500 bg-neutral-700 text-blue-500 focus:ring-blue-500"
                  checked={field.required}
                  disabled={disabled}
                  onChange={(e) =>
                    patchField(index, { required: e.target.checked })
                  }
                />
                {t.requiredLabel}
              </label>

              {rowError && (
                <p className="text-xs text-red-400 mt-2">{rowError}</p>
              )}
            </div>
          );
        })}
      </div>

      {fields.length < 20 && (
        <button
          type="button"
          disabled={disabled}
          onClick={addField}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 border border-neutral-600 text-sm font-medium disabled:opacity-40"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          {t.addField}
        </button>
      )}
    </section>
  );
}

export default RegistrationFieldsEditor;
