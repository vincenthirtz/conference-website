// components/FreePlayers/JoinAsPlayerForm.tsx
//
// Formulaire « je cherche une équipe » — /mercato/joueuse (hub mercato).
//
// Deux partis pris qui expliquent la forme :
//   1. AUCUN COMPTE REQUIS. Exiger une inscription avant même de savoir si
//      quelqu'un la contactera remettrait exactement la friction qu'on cherche
//      à supprimer.
//   2. Peu d'obligatoire. Pseudo, email, au moins un poste — tout le reste
//      (rang, plateforme, contrôle, genre, parcours, objectifs) est
//      facultatif. Une fiche incomplète vaut mieux qu'une fiche jamais envoyée.
//
// Le GENRE est une donnée personnelle : facultatif, « je préfère ne pas dire »
// par défaut (rien n'est affiché), et le formulaire dit qu'il apparaît sur la
// fiche publique avant qu'on le coche. La limite des 50 mots s'affiche en
// direct (`WordLimitedTextarea`), avec la même fonction de comptage que l'API.
//
// Anti-spam : honeypot hors écran + captcha HMAC maison récupéré paresseusement
// à la première interaction — cf. `usePublicFormGuard`.

import { useId, useState } from 'react';
import Link from 'next/link';
import { socialUrl } from '@/config/socials';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsRejoindrePage from '@/lib/i18n/locales/fr/rejoindrePage';
import nsMercato from '@/lib/i18n/locales/fr/mercato';
import { usePublicFormGuard } from '@/hooks/usePublicFormGuard';
import HoneypotField from '@/components/forms/HoneypotField';
import {
  ChipGroup,
  GenderField,
  PUBLIC_FIELD_CLASSES as C,
  RankField,
  WordLimitedTextarea,
} from '@/components/Mercato/MercatoFields';
import {
  INPUT_LABEL,
  PLATFORM_LABEL,
  POSITION_LABEL,
} from '@/components/Mercato/mercatoLabels';
import { FREE_PLAYER_LIMITS } from '@/utils/freePlayers';
import {
  DEFAULT_PLAYER_GENDER,
  MERCATO_INPUTS,
  MERCATO_LIMITS,
  MERCATO_PLATFORMS,
  MERCATO_POSITIONS,
  countWords,
  type MercatoInput,
  type MercatoPlatform,
  type MercatoPosition,
  type PlayerGender,
  type RankDivision,
  type RankTier,
} from '@/utils/mercato';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** La fiche en cours de saisie : un seul objet plutôt qu'un état par champ. */
type PlayerDraft = {
  displayName: string;
  email: string;
  mainRole: MercatoPosition | '';
  positions: MercatoPosition[];
  tier: RankTier | 'unknown';
  division: RankDivision | null;
  platforms: MercatoPlatform[];
  inputs: MercatoInput[];
  gender: PlayerGender;
  pastTeams: string;
  goals: string;
  availability: string;
  note: string;
  contactDiscord: string;
  /**
   * Réseau entre espaces (lot 4) : SA décision, pas celle du site. Décochée
   * par défaut — déposer une annonce ici n'est pas la déposer partout.
   */
  shareAcrossTenants: boolean;
};

const EMPTY_DRAFT: PlayerDraft = {
  displayName: '',
  email: '',
  mainRole: '',
  positions: [],
  tier: 'unknown',
  division: null,
  platforms: [],
  inputs: [],
  gender: DEFAULT_PLAYER_GENDER,
  pastTeams: '',
  goals: '',
  availability: '',
  note: '',
  contactDiscord: '',
  shareAcrossTenants: false,
};

export default function JoinAsPlayerForm({
  onPublished,
}: {
  /** Appelé après une publication réussie. */
  onPublished?: () => void;
}) {
  const t = useT(nsRejoindrePage);
  const tm = useT(nsMercato);

  const [form, setForm] = useState<PlayerDraft>(EMPTY_DRAFT);
  const set =
    <K extends keyof PlayerDraft>(key: K) =>
    (value: PlayerDraft[K]) =>
      setForm((f) => ({ ...f, [key]: value }));
  const {
    displayName,
    email,
    mainRole,
    positions,
    tier,
    division,
    platforms,
    inputs,
    gender,
    pastTeams,
    goals,
    availability,
    note,
    contactDiscord,
    shareAcrossTenants,
  } = form;

  const guard = usePublicFormGuard();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const nameId = useId();
  const emailId = useId();
  const mainRoleId = useId();
  const pastTeamsId = useId();
  const availabilityId = useId();
  const noteId = useId();
  const discordId = useId();
  const captchaId = useId();
  const statusId = useId();

  const fail = (msg: string) => {
    setStatus('error');
    setErrorMsg(msg);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (displayName.trim().length < 2) return fail(t.errorName);
    if (!EMAIL_RE.test(email.trim())) return fail(t.errorEmail);
    if (positions.length === 0 && !mainRole) return fail(tm.errorPositions);
    if (countWords(goals) > MERCATO_LIMITS.goalsWords) {
      return fail(tm.errorGoals);
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/public/free-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim(),
          // Les rôles historiques sont déduits des postes par l'API.
          mainRole: mainRole || undefined,
          positions,
          level: tier,
          rankDivision: tier !== 'unknown' ? division : null,
          gender,
          platforms,
          inputs,
          pastTeams: pastTeams.trim() || undefined,
          goals: goals.trim() || undefined,
          availability: availability.trim() || undefined,
          note: note.trim() || undefined,
          contactDiscord: contactDiscord.trim() || undefined,
          shareAcrossTenants,
          ...guard.payload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        // Le token de captcha est à usage unique : en redemander un permet de
        // réessayer sans recharger la page.
        await guard.refresh();
        throw new Error(data?.error || t.errorGeneric);
      }
      setStatus('success');
      onPublished?.();
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error)?.message || t.errorGeneric);
    }
  }

  // Écran de succès : on enchaîne sur la suite naturelle (le mercato, le
  // Discord) plutôt que de laisser la joueuse dans un cul-de-sac.
  if (status === 'success') {
    return (
      <div
        className="rounded-2xl border border-[var(--color-green)]/30 bg-[var(--color-green)]/10 p-6 text-center"
        role="status"
      >
        <h3 className="text-lg font-bold text-white">{t.successTitle}</h3>
        <p className="mt-2 text-sm text-gray-200">{t.successBody}</p>
        <p className="mt-3 text-sm text-gray-200">{t.successDiscordBody}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/mercato?onglet=joueuses"
            className="inline-block rounded-lg border border-white/20 px-5 py-2.5 text-sm font-bold text-white transition hover:border-white/40"
          >
            {tm.backToHub}
          </Link>
          <a
            href={socialUrl('discord')}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-lg bg-[#5865F2] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
          >
            {t.successDiscordCta}
          </a>
        </div>
        {/* Une fiche expire à 60 jours ; la carte joueuse, elle, reste. */}
        <p className="mt-4 text-xs text-gray-300">
          {t.successCardBody}{' '}
          <Link
            prefetch={false}
            href="/player/discovery"
            className="font-semibold text-[var(--color-green-light)] underline underline-offset-2"
          >
            {t.successCardCta}
          </Link>
        </p>
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
      onFocus={guard.ensure}
      className="space-y-5 rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6"
      noValidate
      data-test="mercato-player-form"
    >
      <div>
        <label htmlFor={nameId} className={C.label}>
          {t.nameLabel}
        </label>
        <input
          id={nameId}
          type="text"
          value={displayName}
          onChange={(e) => set('displayName')(e.target.value)}
          maxLength={FREE_PLAYER_LIMITS.displayName}
          placeholder={t.namePlaceholder}
          className={`${C.input} mt-1`}
          required
        />
      </div>

      <div>
        <label htmlFor={mainRoleId} className={C.label}>
          {tm.mainRoleLabel}
        </label>
        <select
          id={mainRoleId}
          value={mainRole}
          onChange={(e) =>
            set('mainRole')(e.target.value as MercatoPosition | '')
          }
          className={`${C.input} mt-1`}
        >
          <option value="">{tm.mainRoleNone}</option>
          {MERCATO_POSITIONS.map((p) => (
            <option key={p} value={p}>
              {tm[POSITION_LABEL[p]]}
            </option>
          ))}
        </select>
      </div>

      <ChipGroup
        legend={tm.positionsLabel}
        hint={tm.multiHint}
        options={MERCATO_POSITIONS.map((p) => ({
          value: p,
          label: tm[POSITION_LABEL[p]],
        }))}
        value={positions}
        onChange={set('positions')}
      />

      <RankField
        tier={tier}
        division={division}
        onChange={(nextTier, nextDivision) =>
          setForm((f) => ({ ...f, tier: nextTier, division: nextDivision }))
        }
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <ChipGroup
          legend={tm.platformLabel}
          hint={tm.multiHint}
          options={MERCATO_PLATFORMS.map((p) => ({
            value: p,
            label: tm[PLATFORM_LABEL[p]],
          }))}
          value={platforms}
          onChange={set('platforms')}
        />
        <ChipGroup
          legend={tm.inputLabel}
          hint={tm.multiHint}
          options={MERCATO_INPUTS.map((i) => ({
            value: i,
            label: tm[INPUT_LABEL[i]],
          }))}
          value={inputs}
          onChange={set('inputs')}
        />
      </div>

      <GenderField value={gender} onChange={set('gender')} />

      <div>
        <label htmlFor={pastTeamsId} className={C.label}>
          {tm.pastTeamsLabel}
        </label>
        <textarea
          id={pastTeamsId}
          value={pastTeams}
          onChange={(e) => set('pastTeams')(e.target.value)}
          maxLength={MERCATO_LIMITS.pastTeams}
          rows={2}
          placeholder={tm.pastTeamsPlaceholder}
          className={`${C.input} mt-1 resize-y`}
        />
      </div>

      <WordLimitedTextarea
        label={tm.goalsLabel}
        value={goals}
        onChange={set('goals')}
        placeholder={tm.goalsPlaceholder}
      />

      <div>
        <label htmlFor={availabilityId} className={C.label}>
          {t.availabilityLabel}
        </label>
        <input
          id={availabilityId}
          type="text"
          value={availability}
          onChange={(e) => set('availability')(e.target.value)}
          maxLength={FREE_PLAYER_LIMITS.availability}
          placeholder={t.availabilityPlaceholder}
          className={`${C.input} mt-1`}
        />
      </div>

      <div>
        <label htmlFor={noteId} className={C.label}>
          {t.noteLabel}
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => set('note')(e.target.value)}
          maxLength={FREE_PLAYER_LIMITS.note}
          rows={3}
          placeholder={t.notePlaceholder}
          className={`${C.input} mt-1 resize-y`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={emailId} className={C.label}>
            {t.emailLabel}
          </label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => set('email')(e.target.value)}
            maxLength={FREE_PLAYER_LIMITS.contactEmail}
            placeholder={t.emailPlaceholder}
            className={`${C.input} mt-1`}
            required
          />
          <p className={C.hint}>{t.emailHint}</p>
        </div>
        <div>
          <label htmlFor={discordId} className={C.label}>
            {t.discordLabel}
          </label>
          <input
            id={discordId}
            type="text"
            value={contactDiscord}
            onChange={(e) => set('contactDiscord')(e.target.value)}
            maxLength={FREE_PLAYER_LIMITS.contactDiscord}
            placeholder={t.discordPlaceholder}
            className={`${C.input} mt-1`}
          />
          <p className={C.hint}>{t.discordHint}</p>
        </div>
      </div>

      {/* Visibilité au-delà de ce site, posée juste avant l'envoi : c'est le
          moment où l'on décide qui pourra la lire. */}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={shareAcrossTenants}
          onChange={(e) => set('shareAcrossTenants')(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-400"
          data-test="free-player-share-network"
        />
        <span>
          <span className="block text-sm font-medium text-gray-100">
            {t.shareNetworkLabel}
          </span>
          <span className={C.hint}>{t.shareNetworkHint}</span>
        </span>
      </label>

      <HoneypotField
        label={t.honeypotLabel}
        value={guard.honeypot}
        onChange={guard.setHoneypot}
      />

      {guard.question && (
        <div>
          <label htmlFor={captchaId} className={C.label}>
            {fmt(t.captchaLabel, { question: guard.question })}
          </label>
          <input
            id={captchaId}
            type="text"
            inputMode="numeric"
            value={guard.captchaAnswer}
            onChange={(e) => guard.setCaptchaAnswer(e.target.value)}
            placeholder={t.captchaPlaceholder}
            className={`${C.input} mt-1`}
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
