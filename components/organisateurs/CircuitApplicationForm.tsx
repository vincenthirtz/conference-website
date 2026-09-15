// components/organisateurs/CircuitApplicationForm.tsx
//
// Le formulaire de candidature à l'offre partenaire des circuits
// (`POST /api/circuit-partners/apply`).
//
// Même anti-spam que les autres formulaires publics sans compte : honeypot hors
// écran, captcha HMAC récupéré à la première interaction et redemandé après un
// échec (le jeton est à usage unique). Les deux engagements sont des cases à
// cocher OBLIGATOIRES : le serveur les exige à vrai.

import { useId, useRef, useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { useT, format } from '@/lib/i18n/useT';
import nsCircuitPartnersPage from '@/lib/i18n/locales/fr/circuitPartnersPage';

type Captcha = { token: string; question: string };
type Status = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CircuitApplicationForm({
  games,
  className,
}: {
  games: Array<{ slug: string; label: string }>;
  className?: string;
}): JSX.Element {
  const t = useT(nsCircuitPartnersPage);

  const [organizationName, setOrganizationName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [game, setGame] = useState(
    games.find((g) => g.slug === 'valorant')?.slug ?? games[0]?.slug ?? ''
  );
  const [formatValue, setFormatValue] = useState<'feminin' | 'mixte'>(
    'feminin'
  );
  const [seasonStart, setSeasonStart] = useState('');
  const [expectedTeams, setExpectedTeams] = useState('');
  const [website, setWebsite] = useState('');
  const [communityUrl, setCommunityUrl] = useState('');
  const [spaceSlug, setSpaceSlug] = useState('');
  const [message, setMessage] = useState('');
  const [commitCharter, setCommitCharter] = useState(false);
  const [commitLead, setCommitLead] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const ids = {
    org: useId(),
    contact: useId(),
    email: useId(),
    game: useId(),
    format: useId(),
    season: useId(),
    teams: useId(),
    website: useId(),
    community: useId(),
    space: useId(),
    spaceHint: useId(),
    message: useId(),
    messageHint: useId(),
    charter: useId(),
    lead: useId(),
    captcha: useId(),
    status: useId(),
  };

  async function loadCaptcha(force = false) {
    if (fetchedRef.current && !force) return;
    fetchedRef.current = true;
    try {
      const res = await fetch('/api/captcha');
      const data = await res.json();
      if (res.ok) {
        setCaptcha({ token: data.token, question: data.question });
        setCaptchaAnswer('');
      }
    } catch {
      fetchedRef.current = false;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (
      organizationName.trim().length < 2 ||
      contactName.trim().length < 2 ||
      !EMAIL_RE.test(email.trim()) ||
      message.trim().length < 20 ||
      !commitCharter ||
      !commitLead
    ) {
      setStatus('error');
      setErrorMsg(t.errorRequired);
      return;
    }

    setStatus('submitting');
    try {
      const teams = Number.parseInt(expectedTeams, 10);
      const res = await fetch('/api/circuit-partners/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: organizationName.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          game,
          format: formatValue,
          seasonStart: seasonStart || undefined,
          expectedTeams: Number.isFinite(teams) ? teams : undefined,
          website: website.trim(),
          communityUrl: communityUrl.trim(),
          existingSpaceSlug: spaceSlug.trim().toLowerCase() || undefined,
          message: message.trim(),
          commitsCodeOfConduct: commitCharter,
          commitsSafetyLead: commitLead,
          honeypot,
          captchaToken: captcha?.token,
          captchaAnswer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        await loadCaptcha(true);
        throw new Error(data?.error || t.errorGeneric);
      }
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error)?.message || t.errorGeneric);
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className={`rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6 text-center ${className ?? ''}`}
      >
        <h3 className="text-lg font-bold text-white">{t.successTitle}</h3>
        <p className="mt-2 text-sm text-gray-200">{t.successBody}</p>
      </div>
    );
  }

  const input =
    'mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-purple-400 focus:outline-none';
  const label = 'block text-sm font-medium text-gray-200';

  return (
    <form
      onSubmit={handleSubmit}
      onFocus={() => void loadCaptcha()}
      noValidate
      className={`relative space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 ${className ?? ''}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.org} className={label}>
            {t.labelOrganization}
          </label>
          <input
            id={ids.org}
            className={input}
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            maxLength={200}
            required
          />
        </div>
        <div>
          <label htmlFor={ids.contact} className={label}>
            {t.labelContact}
          </label>
          <input
            id={ids.contact}
            className={input}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            maxLength={200}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label htmlFor={ids.email} className={label}>
            {t.labelEmail}
          </label>
          <input
            id={ids.email}
            type="email"
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label htmlFor={ids.game} className={label}>
            {t.labelGame}
          </label>
          <select
            id={ids.game}
            className={input}
            value={game}
            onChange={(e) => setGame(e.target.value)}
          >
            {games.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className={label}>{t.labelFormat}</legend>
          <div className="mt-2 flex gap-4">
            {(['feminin', 'mixte'] as const).map((value) => (
              <label
                key={value}
                className="inline-flex min-h-11 items-center gap-2 text-sm text-gray-200"
              >
                <input
                  type="radio"
                  name={ids.format}
                  value={value}
                  checked={formatValue === value}
                  onChange={() => setFormatValue(value)}
                />
                {value === 'feminin' ? t.formatFeminin : t.formatMixte}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={ids.season} className={label}>
            {t.labelSeasonStart}
          </label>
          <input
            id={ids.season}
            type="date"
            className={input}
            value={seasonStart}
            onChange={(e) => setSeasonStart(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={ids.teams} className={label}>
            {t.labelExpectedTeams}
          </label>
          <input
            id={ids.teams}
            type="number"
            min={2}
            max={512}
            className={input}
            value={expectedTeams}
            onChange={(e) => setExpectedTeams(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={ids.website} className={label}>
            {t.labelWebsite}
          </label>
          <input
            id={ids.website}
            type="url"
            className={input}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            maxLength={500}
          />
        </div>
        <div>
          <label htmlFor={ids.community} className={label}>
            {t.labelCommunity}
          </label>
          <input
            id={ids.community}
            type="url"
            className={input}
            value={communityUrl}
            onChange={(e) => setCommunityUrl(e.target.value)}
            maxLength={500}
          />
        </div>
        <div>
          <label htmlFor={ids.space} className={label}>
            {t.labelSpace}
          </label>
          <input
            id={ids.space}
            className={input}
            value={spaceSlug}
            onChange={(e) => setSpaceSlug(e.target.value)}
            maxLength={100}
            aria-describedby={ids.spaceHint}
          />
          <p id={ids.spaceHint} className="mt-1 text-xs text-gray-400">
            {t.hintSpace}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={ids.message} className={label}>
          {t.labelMessage}
        </label>
        <textarea
          id={ids.message}
          rows={5}
          className={input}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={3000}
          aria-describedby={ids.messageHint}
          required
        />
        <p id={ids.messageHint} className="mt-1 text-xs text-gray-400">
          {t.hintMessage}
        </p>
      </div>

      <div className="space-y-2">
        {[
          {
            id: ids.charter,
            checked: commitCharter,
            set: setCommitCharter,
            text: t.labelCommitCharter,
          },
          {
            id: ids.lead,
            checked: commitLead,
            set: setCommitLead,
            text: t.labelCommitLead,
          },
        ].map((item) => (
          <label
            key={item.id}
            htmlFor={item.id}
            className="flex min-h-11 items-start gap-3 text-sm text-gray-200"
          >
            <input
              id={item.id}
              type="checkbox"
              className="mt-1"
              checked={item.checked}
              onChange={(e) => item.set(e.target.checked)}
              required
            />
            <span>{item.text}</span>
          </label>
        ))}
      </div>

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

      {captcha && (
        <div>
          <label htmlFor={ids.captcha} className={label}>
            {format(t.captchaLabel, { question: captcha.question })}
          </label>
          <input
            id={ids.captcha}
            inputMode="numeric"
            className={input}
            value={captchaAnswer}
            onChange={(e) => setCaptchaAnswer(e.target.value)}
            placeholder={t.captchaPlaceholder}
            required
          />
        </div>
      )}

      {errorMsg && (
        <p id={ids.status} role="alert" className="text-sm text-red-300">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        aria-describedby={errorMsg ? ids.status : undefined}
        className="w-full rounded-lg bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'submitting' ? t.submitting : t.submit}
      </button>
      <p className="text-xs text-gray-400">{t.privacyNote}</p>
    </form>
  );
}
