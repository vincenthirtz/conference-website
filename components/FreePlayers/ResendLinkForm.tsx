// components/FreePlayers/ResendLinkForm.tsx
//
// « J'ai perdu le lien de ma fiche. » Le lien de retrait n'existait que dans
// l'email de confirmation : le perdre obligeait à écrire au staff. Ce
// formulaire le renvoie — à l'adresse de la fiche, et à elle seule (cf.
// /api/public/free-players/resend-link).
//
// Le message de succès est le MÊME que la fiche existe ou non : c'est ce que
// renvoie l'API, et c'est voulu (le formulaire ne doit pas servir à tester qui
// cherche une équipe).

import { useId, useState } from 'react';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsRejoindrePage from '@/lib/i18n/locales/fr/rejoindrePage';
import { FREE_PLAYER_LIMITS } from '@/utils/freePlayers';
import { requestFreePlayerLinks } from '@/utils/freePlayers/client';
import { usePublicFormGuard } from '@/hooks/usePublicFormGuard';
import HoneypotField from '@/components/forms/HoneypotField';

type Status = 'idle' | 'submitting' | 'done' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const inputClass =
  'mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)] placeholder:text-[var(--t3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-violet-light)]';
const labelClass = 'block text-sm font-medium text-[var(--t2)]';

export default function ResendLinkForm() {
  const t = useT(nsRejoindrePage);
  const guard = usePublicFormGuard();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const emailId = useId();
  const captchaId = useId();
  const statusId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!EMAIL_RE.test(email.trim())) {
      setStatus('error');
      setErrorMsg(t.errorEmail);
      return;
    }
    setStatus('submitting');
    try {
      await requestFreePlayerLinks(email.trim(), guard.payload);
      setStatus('done');
    } catch (err) {
      await guard.refresh();
      setStatus('error');
      setErrorMsg((err as Error)?.message || t.resendError);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-6">
      <h2 className="font-bold text-[var(--t1)]">{t.resendTitle}</h2>
      <p className="mt-2 text-sm text-[var(--t2)]">{t.resendIntro}</p>

      {status === 'done' ? (
        <p role="status" className="mt-4 text-sm text-[var(--color-green-light)]">
          {t.resendDone}
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          onFocus={guard.ensure}
          className="relative mt-4 space-y-4"
          noValidate
        >
          <div>
            <label htmlFor={emailId} className={labelClass}>
              {t.resendEmailLabel}
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={FREE_PLAYER_LIMITS.contactEmail}
              className={inputClass}
              required
            />
          </div>

          <HoneypotField
            label={t.honeypotLabel}
            value={guard.honeypot}
            onChange={guard.setHoneypot}
          />

          {guard.question && (
            <div>
              <label htmlFor={captchaId} className={labelClass}>
                {fmt(t.captchaLabel, { question: guard.question })}
              </label>
              <input
                id={captchaId}
                type="text"
                inputMode="numeric"
                value={guard.captchaAnswer}
                onChange={(e) => guard.setCaptchaAnswer(e.target.value)}
                placeholder={t.captchaPlaceholder}
                className={inputClass}
                required
              />
            </div>
          )}

          {errorMsg && (
            <p id={statusId} role="alert" className="text-sm text-[var(--err)]">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            aria-describedby={errorMsg ? statusId : undefined}
            className="rounded-lg border border-[var(--line2)] bg-[var(--s2)] px-4 py-2 text-sm font-semibold text-[var(--t1)] transition hover:border-[var(--line-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'submitting' ? t.resendWorking : t.resendSubmit}
          </button>
        </form>
      )}
    </div>
  );
}
