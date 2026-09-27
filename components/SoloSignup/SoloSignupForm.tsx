// components/SoloSignup/SoloSignupForm.tsx
//
// Le formulaire d'inscription individuelle. Un écran, trois champs
// obligatoires — pseudo, BattleTag, email — plus les champs personnalisés que
// l'organisatrice a éventuellement définis sur le tournoi.
//
// POURQUOI SI PEU DE CHAMPS. Chaque champ obligatoire de plus coûte des
// abandons, et l'événement visé est ponctuel : on n'a besoin que de savoir
// QUI joue (pseudo), comment l'inviter en partie (BattleTag) et comment la
// joindre (email). Tout le reste est du confort qui peut se demander après.
//
// CE QUI PART SUR LE RÉSEAU. Exactement le payload d'une inscription d'équipe
// (/api/teams/create-with-member), avec un roster d'UNE joueuse qui est sa
// propre capitaine. Réutiliser cette route plutôt que d'en écrire une seconde
// nous donne gratuitement : la validation du BattleTag, la création de compte,
// le pont magic-link, l'anti-abus (honeypot + captcha + rate-limit),
// l'idempotence, les champs personnalisés, et l'inscription au tournoi ou le
// dépôt de candidature selon ce que le staff a paramétré.
//
// ANTI-SPAM. Honeypot hors écran + captcha maison récupéré PARESSEUSEMENT à la
// première interaction : afficher la page ne doit pas déclencher de requête.

import { useId, useRef, useState } from 'react';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsSoloSignup from '@/lib/i18n/locales/fr/soloSignup';
import type { RegistrationField } from '@/utils/registrationFields';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';

type FieldValue = string | number | boolean;
type Captcha = { token: string; question: string };
type Status = 'idle' | 'submitting' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Dict = typeof nsSoloSignup.fr;

/**
 * Réponse utile de /api/teams/create-with-member. On n'y lit que ce dont cet
 * écran a besoin : inscrite pour de bon, ou candidature en attente.
 */
type CreateResponse = {
  team?: { id: string; name: string };
  tournament?: { tournament_name: string };
  tournament_application?: { tournament_name: string };
  accessEmail?: { sent: boolean; to: string };
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
};

/** Issue d'une inscription réussie — ce que l'écran de confirmation affiche. */
type Success = {
  pending: boolean;
  tournamentName: string;
  emailSentTo: string | null;
};

function genIdempotencyKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const inputCls =
  'w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-[var(--color-green)] focus:outline-none';
const labelCls = 'mb-1 block text-sm font-medium text-gray-200';
const helpCls = 'mt-1 text-[11px] text-gray-500';

export default function SoloSignupForm({
  tournamentId,
  tournamentName,
  registrationFields,
}: {
  tournamentId: string;
  tournamentName: string;
  registrationFields: RegistrationField[];
}) {
  const t = useT(nsSoloSignup);

  const [pseudo, setPseudo] = useState('');
  const [battleTag, setBattleTag] = useState('');
  const [email, setEmail] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>(
    () => {
      const init: Record<string, FieldValue> = {};
      for (const f of registrationFields) {
        init[f.key] = f.type === 'checkbox' ? false : '';
      }
      return init;
    }
  );

  const [honeypot, setHoneypot] = useState('');
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<Success | null>(null);

  const captchaFetchedRef = useRef(false);
  // Clé stable par INTENTION : tant que l'inscription n'a pas abouti, un
  // double-clic ou un retry réseau rejoue la même clé et ne crée pas deux
  // inscriptions. Elle est renouvelée après un succès, pour que « inscrire une
  // autre joueuse » ne se fasse pas dédupliquer contre la précédente.
  const idempotencyKeyRef = useRef(genIdempotencyKey());

  const pseudoId = useId();
  const battleTagId = useId();
  const emailId = useId();
  const captchaId = useId();
  const statusId = useId();

  async function loadCaptcha(force = false) {
    if (captchaFetchedRef.current && !force) return;
    captchaFetchedRef.current = true;
    try {
      const res = await fetch('/api/captcha');
      const data = await res.json();
      if (res.ok) {
        setCaptcha({ token: data.token, question: data.question });
        setCaptchaAnswer('');
      }
    } catch {
      // Signalé à la soumission si le captcha est toujours absent.
      captchaFetchedRef.current = false;
    }
  }

  function updateField(key: string, value: FieldValue) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** Code serveur → message localisé. Un code inconnu retombe sur le générique. */
  function localizedCode(code?: string): string | undefined {
    if (!code) return undefined;
    const map: Record<string, keyof Dict> = {
      RATE_LIMITED: 'errRateLimited',
      CAPTCHA_INVALID: 'errCaptchaInvalid',
      NAME_TOO_SHORT: 'errNameTooShort',
      NAME_TOO_LONG: 'errNameTooLong',
      SLUG_CONFLICT: 'errSlugConflict',
      BATTLETAG_REQUIRED: 'errBattletagRequired',
      BATTLETAG_INVALID: 'errBattletagInvalid',
      FIELD_ERRORS: 'errFieldErrors',
      SERVICE_UNAVAILABLE: 'errServiceUnavailable',
      SERVER_ERROR: 'errServerError',
    };
    const key = map[code];
    return key ? (t[key] as string) : undefined;
  }

  /** Validation client — reproduit les invariants serveur, sans s'y substituer. */
  function clientError(): string | null {
    if (pseudo.trim().length < 2) return t.validationPseudo;
    if (!EMAIL_RE.test(email.trim())) return t.validationEmail;
    if (!BATTLE_TAG_REGEX.test(battleTag.trim())) return t.validationBattleTag;
    for (const f of registrationFields) {
      if (!f.required) continue;
      const v = fieldValues[f.key];
      const empty =
        f.type === 'checkbox' ? v !== true : `${v ?? ''}`.trim().length === 0;
      if (empty) return t.validationFieldRequired;
    }
    if (!captcha || captchaAnswer.trim().length === 0) {
      return t.validationCaptcha;
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'submitting') return;

    setErrorMsg(null);
    setFieldErrors({});

    const invalid = clientError();
    if (invalid) {
      // Le captcha peut simplement n'avoir jamais été chargé (aucune
      // interaction avec ses champs) : on le récupère au lieu de laisser la
      // participante devant un message qu'elle ne peut pas résoudre.
      if (!captcha) void loadCaptcha();
      setStatus('error');
      setErrorMsg(invalid);
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/teams/create-with-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          // Le pseudo EST le nom de l'« équipe » : c'est sous ce nom que la
          // participante apparaîtra partout en aval (lobbies, classement).
          name: pseudo.trim(),
          members: [
            {
              email: email.trim(),
              role: 'player',
              battle_tag: battleTag.trim(),
              specialty: null,
              set_captain: true,
            },
          ],
          tournament_id: tournamentId,
          field_values: registrationFields.length ? fieldValues : undefined,
          captchaToken: captcha?.token,
          captchaAnswer: captchaAnswer.trim(),
          honeypot,
        }),
      });

      const json: CreateResponse = await res.json();

      if (!res.ok || json.error) {
        // Le token captcha est à usage unique : sans une nouvelle question, la
        // participante ne peut pas réessayer sans recharger la page.
        void loadCaptcha(true);
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        setStatus('error');
        setErrorMsg(localizedCode(json.code) || json.error || t.errGeneric);
        return;
      }

      setSuccess({
        pending: !json.tournament && !!json.tournament_application,
        tournamentName:
          json.tournament?.tournament_name ||
          json.tournament_application?.tournament_name ||
          tournamentName,
        emailSentTo: json.accessEmail?.sent ? json.accessEmail.to : null,
      });
      setStatus('idle');
    } catch {
      void loadCaptcha(true);
      setStatus('error');
      setErrorMsg(t.errGeneric);
    }
  }

  function reset() {
    setSuccess(null);
    setPseudo('');
    setBattleTag('');
    setEmail('');
    setCaptchaAnswer('');
    setErrorMsg(null);
    setFieldErrors({});
    setFieldValues(() => {
      const init: Record<string, FieldValue> = {};
      for (const f of registrationFields) {
        init[f.key] = f.type === 'checkbox' ? false : '';
      }
      return init;
    });
    idempotencyKeyRef.current = genIdempotencyKey();
    void loadCaptcha(true);
  }

  if (success) {
    return (
      <div
        className="rounded-2xl border border-[var(--color-green)]/30 bg-[var(--color-green)]/10 p-6 text-center"
        role="status"
      >
        <h2 className="text-lg font-semibold text-white">
          {success.pending ? t.successPendingTitle : t.successTitle}
        </h2>
        <p className="mt-2 text-sm text-gray-200">
          {fmt(success.pending ? t.successPendingBody : t.successBody, {
            tournament: success.tournamentName,
          })}
        </p>
        {success.emailSentTo && (
          <p className="mt-2 text-sm text-gray-300">
            {fmt(t.successEmailSent, { email: success.emailSentTo })}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-xl border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          {t.successAnother}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onFocus={() => void loadCaptcha()}
      className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6"
      noValidate
    >
      <div>
        <h2 className="text-lg font-semibold text-white">{t.formTitle}</h2>
        <p className="mt-1 text-sm text-gray-400">{t.formHint}</p>
      </div>

      {/* Honeypot : hors écran, jamais annoncé aux lecteurs d'écran. */}
      <input
        type="text"
        name="company"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div>
        <label htmlFor={pseudoId} className={labelCls}>
          {t.pseudoLabel}
        </label>
        <input
          id={pseudoId}
          type="text"
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          placeholder={t.pseudoPlaceholder}
          maxLength={100}
          autoComplete="nickname"
          className={inputCls}
        />
        <p className={helpCls}>{t.pseudoHelp}</p>
      </div>

      <div>
        <label htmlFor={battleTagId} className={labelCls}>
          {t.battleTagLabel}
        </label>
        <input
          id={battleTagId}
          type="text"
          value={battleTag}
          onChange={(e) => setBattleTag(e.target.value)}
          placeholder={t.battleTagPlaceholder}
          maxLength={50}
          className={inputCls}
        />
        <p className={helpCls}>{t.battleTagHelp}</p>
      </div>

      <div>
        <label htmlFor={emailId} className={labelCls}>
          {t.emailLabel}
        </label>
        <input
          id={emailId}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailPlaceholder}
          autoComplete="email"
          className={inputCls}
        />
        <p className={helpCls}>{t.emailHelp}</p>
      </div>

      {registrationFields.length > 0 && (
        <div className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-sm font-semibold text-white">{t.extraTitle}</h3>
          {registrationFields.map((field) => {
            const value = fieldValues[field.key];
            const stringValue =
              typeof value === 'string'
                ? value
                : typeof value === 'number'
                  ? String(value)
                  : '';
            const controlId = `solo-field-${field.key}`;
            const describedBy = field.help ? `${controlId}-help` : undefined;
            const err = fieldErrors[field.key];

            if (field.type === 'checkbox') {
              return (
                <div key={field.key}>
                  <label className="inline-flex items-start gap-2 text-sm text-gray-200">
                    <input
                      id={controlId}
                      type="checkbox"
                      checked={value === true}
                      onChange={(e) => updateField(field.key, e.target.checked)}
                      aria-describedby={describedBy}
                      className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/60"
                    />
                    <span>
                      {field.label}
                      {field.required && (
                        <span className="text-[var(--color-green)]">
                          {' '}
                          {t.extraRequiredMark}
                        </span>
                      )}
                    </span>
                  </label>
                  {field.help && (
                    <p id={describedBy} className={helpCls}>
                      {field.help}
                    </p>
                  )}
                  {err && (
                    <p className="mt-1 text-xs text-[var(--status-error)]">
                      {err}
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
                      {t.extraRequiredMark}
                    </span>
                  )}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={controlId}
                    rows={4}
                    maxLength={field.maxLength}
                    value={stringValue}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    aria-describedby={describedBy}
                    className={inputCls}
                  />
                ) : field.type === 'select' ? (
                  <select
                    id={controlId}
                    value={stringValue}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    aria-describedby={describedBy}
                    className={inputCls}
                  >
                    <option value="">{t.extraSelectPlaceholder}</option>
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
                    maxLength={
                      field.type === 'text' ? field.maxLength : undefined
                    }
                    value={stringValue}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    aria-describedby={describedBy}
                    className={inputCls}
                  />
                )}
                {field.help && (
                  <p id={describedBy} className={helpCls}>
                    {field.help}
                  </p>
                )}
                {err && (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {err}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <label htmlFor={captchaId} className={labelCls}>
          {t.captchaLabel}
          {captcha ? ` — ${captcha.question}` : ''}
        </label>
        <input
          id={captchaId}
          type="text"
          value={captchaAnswer}
          onChange={(e) => setCaptchaAnswer(e.target.value)}
          onFocus={() => void loadCaptcha()}
          placeholder={t.captchaPlaceholder}
          autoComplete="off"
          inputMode="numeric"
          className={inputCls}
        />
      </div>

      {errorMsg && (
        <p
          id={statusId}
          role="alert"
          className="rounded-xl border border-[var(--status-error)]/40 bg-[var(--status-error)]/10 px-3 py-2 text-sm text-[var(--status-error)]"
        >
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        aria-describedby={errorMsg ? statusId : undefined}
        className="w-full rounded-xl bg-[var(--color-green)] px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'submitting' ? t.submitting : t.submit}
      </button>
    </form>
  );
}
