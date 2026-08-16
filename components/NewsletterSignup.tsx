// components/NewsletterSignup.tsx
// Public double opt-in newsletter signup.
//
// Posts to POST /api/public/newsletter/subscribe. The endpoint always returns a
// generic { success: true }; the real confirmation happens when the user clicks
// the link in the confirmation email (double opt-in). So on success we tell the
// user to check their inbox — never « you are subscribed ».
//
// Anti-spam mirrors the public scrim form (components/Team/PublicScrimDialog):
//   - hidden honeypot field (`honeypot`)
//   - HMAC math captcha fetched from /api/captcha ({ token, question })
// The captcha is fetched lazily on first interaction so the footer variant,
// present on every page, does not fire a request on each page load.

import { useId, useRef, useState } from 'react';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsNewsletterSignup from '@/lib/i18n/locales/fr/newsletterSignup';

type Props = {
  source?: string;
  variant?: 'footer' | 'section';
};

type Captcha = { token: string; question: string };
type Status = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function NewsletterSignup({
  source = 'footer',
  variant = 'footer',
}: Props) {
  const t = useT(nsNewsletterSignup);
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const emailId = useId();
  const captchaId = useId();
  const statusId = useId();
  const isSection = variant === 'section';

  async function ensureCaptcha() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    try {
      const res = await fetch('/api/captcha');
      const data = await res.json();
      if (res.ok) setCaptcha({ token: data.token, question: data.question });
    } catch {
      // Surfaced on submit if still missing.
      fetchedRef.current = false;
    }
  }

  async function refreshCaptcha() {
    try {
      const res = await fetch('/api/captcha');
      const data = await res.json();
      if (res.ok) {
        setCaptcha({ token: data.token, question: data.question });
        setCaptchaAnswer('');
      }
    } catch {
      /* noop */
    }
  }

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
      const res = await fetch('/api/public/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source,
          honeypot,
          captchaToken: captcha?.token,
          captchaAnswer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        await refreshCaptcha();
        throw new Error(data?.error || t.errorGeneric);
      }
      setStatus('success');
      setEmail('');
      setCaptchaAnswer('');
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error)?.message || t.errorGeneric);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-green)]';
  const buttonClass =
    'inline-flex items-center justify-center rounded-lg bg-[var(--color-green)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] disabled:cursor-not-allowed disabled:opacity-50';

  // Honeypot: off-screen, aria-hidden, not tabbable.
  const honeypotField = (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '-9999px',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
      }}
    >
      <label>
        {t.honeypotLabel}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </label>
    </div>
  );

  const statusRegion = (
    <div id={statusId} aria-live="polite" role="status">
      {status === 'success' && (
        <p
          className={
            isSection
              ? 'rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100'
              : 'text-sm text-emerald-300'
          }
        >
          {t.successBody}
        </p>
      )}
      {status === 'error' && errorMsg && (
        <p
          className={
            isSection
              ? 'rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100'
              : 'text-sm text-red-300'
          }
        >
          {errorMsg}
        </p>
      )}
    </div>
  );

  const captchaField = captcha && (
    <div className={isSection ? '' : 'w-full'}>
      <label
        htmlFor={captchaId}
        className="mb-1 block text-xs uppercase tracking-wide text-gray-400"
      >
        {fmt(t.captchaLabel, { question: captcha.question })}
      </label>
      <input
        id={captchaId}
        type="text"
        inputMode="numeric"
        required
        value={captchaAnswer}
        onChange={(e) => setCaptchaAnswer(e.target.value)}
        placeholder={t.captchaPlaceholder}
        className={inputClass}
      />
    </div>
  );

  // ---- SUCCESS (both variants collapse to the confirmation message) ----
  if (status === 'success') {
    if (isSection) {
      return (
        <section
          aria-label={t.sectionTitle}
          className="mx-auto my-12 max-w-2xl px-4"
        >
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-8 text-center">
            <h2 className="text-xl font-semibold text-white">
              {t.successTitle}
            </h2>
            <p className="mt-2 text-sm text-emerald-100">{t.successBody}</p>
          </div>
        </section>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
          {t.footerTitle}
        </p>
        {statusRegion}
      </div>
    );
  }

  // ---- SECTION VARIANT ----
  if (isSection) {
    return (
      <section
        aria-labelledby={`${emailId}-heading`}
        className="mx-auto my-12 max-w-2xl px-4"
      >
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 sm:px-8 sm:py-10">
          <div className="text-center">
            <h2
              id={`${emailId}-heading`}
              className="text-2xl font-bold text-brand-gradient sm:text-3xl"
            >
              {t.sectionTitle}
            </h2>
            <span className="brand-rule mx-auto mt-3" aria-hidden />
            <p className="mx-auto mt-3 max-w-xl text-sm text-gray-300 sm:text-base">
              {t.sectionDescription}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {honeypotField}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label htmlFor={emailId} className="sr-only">
                  {t.emailLabel}
                </label>
                <input
                  id={emailId}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onFocus={ensureCaptcha}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  aria-describedby={statusId}
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={status === 'submitting'}
                className={`${buttonClass} sm:w-auto`}
              >
                {status === 'submitting' ? t.submitting : t.submit}
              </button>
            </div>
            {captchaField}
            {statusRegion}
            <p className="text-xs text-gray-500">{t.privacyNote}</p>
          </form>
        </div>
      </section>
    );
  }

  // ---- FOOTER VARIANT (compact) ----
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-300">
          {t.footerTitle}
        </p>
        <p className="mt-1 text-sm text-gray-400">{t.footerDescription}</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
        {honeypotField}
        <div className="flex gap-2">
          <label htmlFor={emailId} className="sr-only">
            {t.emailLabel}
          </label>
          <input
            id={emailId}
            type="email"
            required
            autoComplete="email"
            value={email}
            onFocus={ensureCaptcha}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            aria-describedby={statusId}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={status === 'submitting'}
            className={`${buttonClass} shrink-0`}
          >
            {status === 'submitting' ? t.submitting : t.submit}
          </button>
        </div>
        {captchaField}
        {statusRegion}
      </form>
    </div>
  );
}
