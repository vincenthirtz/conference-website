// components/TeamOpenings/PostOpeningForm.tsx
//
// Formulaire « mon équipe cherche une joueuse » — miroir exact de
// JoinAsPlayerForm, et pour les mêmes raisons :
//   1. AUCUN COMPTE REQUIS. Une capitaine à qui il manque une joueuse la
//      cherche souvent AVANT d'inscrire son équipe : lui demander de créer un
//      compte d'abord, c'est la renvoyer sur Discord et perdre l'annonce.
//   2. Trois champs obligatoires seulement : nom d'équipe, email, au moins un
//      poste recherché. Une annonce incomplète vaut mieux qu'une annonce jamais
//      publiée.
//
// Anti-spam identique au reste des formulaires publics : honeypot hors écran +
// captcha HMAC maison récupéré paresseusement à la première interaction (le
// simple affichage de la page ne doit déclencher aucune requête).

import { useId, useRef, useState } from 'react';
import { socialUrl } from '@/config/socials';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsRecrutementPage from '@/lib/i18n/locales/fr/recrutementPage';
import {
  TEAM_OPENING_LEVELS,
  TEAM_OPENING_LIMITS,
  TEAM_OPENING_ROLES,
  type TeamOpeningLevel,
  type TeamOpeningRole,
} from '@/utils/teamOpenings';

type Captcha = { token: string; question: string };
type Status = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Dict = typeof nsRecrutementPage.fr;

/** Libellé i18n d'un poste. Table explicite : pas de clé construite à la volée. */
const ROLE_LABEL: Record<TeamOpeningRole, keyof Dict> = {
  tank: 'roleTank',
  dps: 'roleDps',
  support: 'roleSupport',
  flex: 'roleFlex',
};

const LEVEL_LABEL: Record<TeamOpeningLevel, keyof Dict> = {
  unknown: 'levelUnknown',
  bronze: 'levelBronze',
  silver: 'levelSilver',
  gold: 'levelGold',
  platinum: 'levelPlatinum',
  emerald: 'levelEmerald',
  diamond: 'levelDiamond',
  master: 'levelMaster',
  grandmaster: 'levelGrandmaster',
  champion: 'levelChampion',
};

export default function PostOpeningForm({
  onPublished,
}: {
  /** Appelé après une publication réussie — la page rafraîchit sa liste. */
  onPublished?: () => void;
}) {
  const t = useT(nsRecrutementPage);

  const [teamName, setTeamName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [roles, setRoles] = useState<TeamOpeningRole[]>([]);
  const [level, setLevel] = useState<TeamOpeningLevel>('unknown');
  const [availability, setAvailability] = useState('');
  const [note, setNote] = useState('');
  const [contactDiscord, setContactDiscord] = useState('');

  const [honeypot, setHoneypot] = useState('');
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const teamNameId = useId();
  const emailId = useId();
  const availabilityId = useId();
  const noteId = useId();
  const discordId = useId();
  const levelId = useId();
  const captchaId = useId();
  const statusId = useId();

  async function ensureCaptcha() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    try {
      const res = await fetch('/api/captcha');
      const data = await res.json();
      if (res.ok) setCaptcha({ token: data.token, question: data.question });
    } catch {
      // Signalé à la soumission si toujours absent.
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

  function toggleRole(role: TeamOpeningRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (teamName.trim().length < 2) {
      setStatus('error');
      setErrorMsg(t.errorTeamName);
      return;
    }
    if (!EMAIL_RE.test(contactEmail.trim())) {
      setStatus('error');
      setErrorMsg(t.errorEmail);
      return;
    }
    if (roles.length === 0) {
      setStatus('error');
      setErrorMsg(t.errorRoles);
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/public/team-openings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: teamName.trim(),
          roles,
          level,
          availability: availability.trim() || undefined,
          note: note.trim() || undefined,
          contactEmail: contactEmail.trim(),
          contactDiscord: contactDiscord.trim() || undefined,
          honeypot,
          captchaToken: captcha?.token,
          captchaAnswer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        // Le token de captcha est à usage unique : en redemander un permet de
        // réessayer sans recharger la page.
        await refreshCaptcha();
        throw new Error(data?.error || t.errorGeneric);
      }
      setStatus('success');
      onPublished?.();
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error)?.message || t.errorGeneric);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet-light)]';
  const labelClass = 'block text-sm font-medium text-gray-200';
  const hintClass = 'mt-1 text-xs text-gray-400';

  // Écran de succès : il enchaîne sur le Discord plutôt que de laisser la
  // capitaine dans un cul-de-sac. C'est là que les joueuses libres se
  // signalent — l'annonce publiée ne remplace pas la présence sur le serveur.
  if (status === 'success') {
    return (
      <div
        className="rounded-2xl border border-[var(--color-green)]/30 bg-[var(--color-green)]/10 p-6 text-center"
        role="status"
      >
        <h3 className="text-lg font-bold text-white">{t.successTitle}</h3>
        <p className="mt-2 text-sm text-gray-200">{t.successBody}</p>
        <p className="mt-3 text-sm text-gray-200">{t.successDiscordBody}</p>
        <a
          href={socialUrl('discord')}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block rounded-lg bg-[#5865F2] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
        >
          {t.successDiscordCta}
        </a>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="text-sm font-semibold text-[var(--color-green-light)] underline underline-offset-2"
          >
            {t.successAgain}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onFocus={ensureCaptcha}
      className="space-y-5 rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6"
      noValidate
    >
      <div>
        <label htmlFor={teamNameId} className={labelClass}>
          {t.teamNameLabel}
        </label>
        <input
          id={teamNameId}
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          maxLength={TEAM_OPENING_LIMITS.teamName}
          placeholder={t.teamNamePlaceholder}
          className={`${inputClass} mt-1`}
          required
        />
      </div>

      <fieldset>
        <legend className={labelClass}>{t.rolesLabel}</legend>
        <p className={hintClass}>{t.rolesHint}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEAM_OPENING_ROLES.map((role) => {
            const active = roles.includes(role);
            return (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                aria-pressed={active}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  active
                    ? 'border-[var(--color-violet-light)] bg-[var(--color-violet)]/30 text-white'
                    : 'border-white/15 bg-white/[0.03] text-gray-300 hover:border-white/30'
                }`}
              >
                {t[ROLE_LABEL[role]] as string}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor={levelId} className={labelClass}>
          {t.levelLabel}
        </label>
        <select
          id={levelId}
          value={level}
          onChange={(e) => setLevel(e.target.value as TeamOpeningLevel)}
          className={`${inputClass} mt-1`}
        >
          {TEAM_OPENING_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {t[LEVEL_LABEL[lvl]] as string}
            </option>
          ))}
        </select>
        <p className={hintClass}>{t.levelHint}</p>
      </div>

      <div>
        <label htmlFor={availabilityId} className={labelClass}>
          {t.availabilityLabel}
        </label>
        <input
          id={availabilityId}
          type="text"
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          maxLength={TEAM_OPENING_LIMITS.availability}
          placeholder={t.availabilityPlaceholder}
          className={`${inputClass} mt-1`}
        />
      </div>

      <div>
        <label htmlFor={noteId} className={labelClass}>
          {t.noteLabel}
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={TEAM_OPENING_LIMITS.note}
          rows={3}
          placeholder={t.notePlaceholder}
          className={`${inputClass} mt-1 resize-y`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={emailId} className={labelClass}>
            {t.emailLabel}
          </label>
          <input
            id={emailId}
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            maxLength={TEAM_OPENING_LIMITS.contactEmail}
            placeholder={t.emailPlaceholder}
            className={`${inputClass} mt-1`}
            required
          />
          <p className={hintClass}>{t.emailHint}</p>
        </div>
        <div>
          <label htmlFor={discordId} className={labelClass}>
            {t.discordLabel}
          </label>
          <input
            id={discordId}
            type="text"
            value={contactDiscord}
            onChange={(e) => setContactDiscord(e.target.value)}
            maxLength={TEAM_OPENING_LIMITS.contactDiscord}
            placeholder={t.discordPlaceholder}
            className={`${inputClass} mt-1`}
          />
          <p className={hintClass}>{t.discordHint}</p>
        </div>
      </div>

      {/* Honeypot : hors écran, invisible aux lecteurs d'écran, non tabulable. */}
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
          <label htmlFor={captchaId} className={labelClass}>
            {fmt(t.captchaLabel, { question: captcha.question })}
          </label>
          <input
            id={captchaId}
            type="text"
            inputMode="numeric"
            value={captchaAnswer}
            onChange={(e) => setCaptchaAnswer(e.target.value)}
            placeholder={t.captchaPlaceholder}
            className={`${inputClass} mt-1`}
            required
          />
        </div>
      )}

      {errorMsg && (
        <p id={statusId} role="alert" className="text-sm text-red-300">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        aria-describedby={errorMsg ? statusId : undefined}
        className="w-full rounded-lg bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'submitting' ? t.submitting : t.submit}
      </button>

      <p className="text-xs text-gray-400">{t.privacyNote}</p>
    </form>
  );
}
