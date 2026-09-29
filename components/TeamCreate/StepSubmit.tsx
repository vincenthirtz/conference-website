// components/TeamCreate/StepSubmit.tsx — étape 3 du wizard : tournoi, champs d'inscription, captcha, envoi
// (lot P11 : extrait de pages/team/create.tsx à l'identique — mêmes classes,
// mêmes textes).

import type { TeamCreateWizard } from './useTeamCreateWizard';

export default function StepSubmit({ w }: { w: TeamCreateWizard }) {
  const {
    t,
    errorMsg,
    registrationFields,
    fieldValues,
    fieldErrors,
    captchaQuestion,
    captchaAnswer,
    setCaptchaAnswer,
    stepHeadingRef,
    refreshCaptcha,
    handleFieldChange,
    inputCls,
    labelCls,
  } = w;
  return (
    <section key="step-3" className="wizard-step-enter space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
          {t.customFieldsEyebrow}
        </p>
        <h2
          ref={stepHeadingRef}
          tabIndex={-1}
          className="text-xl font-semibold outline-none"
        >
          {t.stepSubmit}
        </h2>
      </div>

      {registrationFields.length > 0 && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold text-white">
            {t.customFieldsTitle}
          </h3>
          {registrationFields.map((field) => {
            const value = fieldValues[field.key];
            const stringValue =
              typeof value === 'string'
                ? value
                : typeof value === 'number'
                  ? String(value)
                  : '';
            const rawError = fieldErrors[field.key];
            const fieldError = rawError
              ? rawError === 'Ce champ est requis.'
                ? t.customFieldRequiredError
                : rawError
              : undefined;
            const controlId = `custom-field-${field.key}`;
            const describedBy = field.help ? `${controlId}-help` : undefined;

            if (field.type === 'checkbox') {
              return (
                <div key={field.key}>
                  <label className="inline-flex items-start gap-2 text-sm text-gray-200">
                    <input
                      id={controlId}
                      type="checkbox"
                      checked={value === true}
                      onChange={(e) =>
                        handleFieldChange(field.key, e.target.checked)
                      }
                      aria-describedby={describedBy}
                      className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/60"
                    />
                    <span>
                      {field.label}
                      {field.required && (
                        <span className="text-[var(--color-green)]">
                          {' '}
                          {t.customFieldRequiredMark}
                        </span>
                      )}
                    </span>
                  </label>
                  {field.help && (
                    <p
                      id={describedBy}
                      className="mt-1 text-[11px] text-gray-500"
                    >
                      {field.help}
                    </p>
                  )}
                  {fieldError && (
                    <p className="mt-1 text-xs text-[var(--status-error)]">
                      {fieldError}
                    </p>
                  )}
                </div>
              );
            }

            return (
              <div key={field.key}>
                <label htmlFor={controlId} className={labelCls}>
                  {field.label}
                  {field.required && (
                    <span className="text-[var(--color-green)]">
                      {' '}
                      {t.customFieldRequiredMark}
                    </span>
                  )}
                </label>

                {field.type === 'textarea' ? (
                  <textarea
                    id={controlId}
                    rows={4}
                    required={field.required}
                    maxLength={field.maxLength}
                    value={stringValue}
                    onChange={(e) =>
                      handleFieldChange(field.key, e.target.value)
                    }
                    aria-describedby={describedBy}
                    className={inputCls}
                  />
                ) : field.type === 'select' ? (
                  <select
                    id={controlId}
                    required={field.required}
                    value={stringValue}
                    onChange={(e) =>
                      handleFieldChange(field.key, e.target.value)
                    }
                    aria-describedby={describedBy}
                    className={inputCls}
                  >
                    <option value="">{t.customFieldSelectPlaceholder}</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={controlId}
                    type={
                      field.type === 'number'
                        ? 'number'
                        : field.type === 'url'
                          ? 'url'
                          : 'text'
                    }
                    required={field.required}
                    maxLength={
                      field.type === 'text' ? field.maxLength : undefined
                    }
                    value={stringValue}
                    onChange={(e) =>
                      handleFieldChange(field.key, e.target.value)
                    }
                    aria-describedby={describedBy}
                    className={inputCls}
                  />
                )}

                {field.help && (
                  <p
                    id={describedBy}
                    className="mt-1 text-[11px] text-gray-500"
                  >
                    {field.help}
                  </p>
                )}
                {fieldError && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {fieldError}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <label htmlFor="captcha" className={labelCls}>
          {t.captchaLabel} *
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-xl border border-white/15 bg-black/60 px-3 py-2 font-mono text-sm text-white">
            {captchaQuestion ? `${captchaQuestion} = ?` : '… = ?'}
          </span>
          <input
            id="captcha"
            required
            inputMode="numeric"
            value={captchaAnswer}
            onChange={(e) => setCaptchaAnswer(e.target.value)}
            className="w-32 rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-[var(--color-violet)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet)]/70"
            placeholder={t.captchaPlaceholder}
          />
          <button
            type="button"
            onClick={refreshCaptcha}
            className="text-xs text-gray-400 hover:text-white"
          >
            {t.captchaRefresh}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-[var(--status-error)]/50 bg-[var(--status-error)]/10 px-3 py-2 text-sm text-red-100"
        >
          {errorMsg}
        </div>
      )}
    </section>
  );
}
