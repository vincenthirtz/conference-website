// components/TeamOpenings/PostOpeningForm.tsx
//
// Formulaire « mon équipe recrute » — /mercato/equipe (hub mercato), miroir
// de JoinAsPlayerForm et pour les mêmes raisons :
//   1. AUCUN COMPTE REQUIS. Une capitaine à qui il manque une joueuse la
//      cherche souvent AVANT d'inscrire son équipe : lui demander de créer un
//      compte d'abord, c'est la renvoyer sur Discord et perdre l'annonce.
//   2. Trois champs obligatoires seulement : nom d'équipe, email, au moins un
//      poste recherché. Profils, rang, plateforme, contrôle, description :
//      facultatifs. Une case vide côté équipe veut dire « peu importe ».
//
// Anti-spam identique au reste des formulaires publics : honeypot hors écran +
// captcha HMAC maison récupéré à la première interaction (`usePublicFormGuard`).

import { useId, useState } from 'react';
import Link from 'next/link';
import { socialUrl } from '@/config/socials';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsRecrutementPage from '@/lib/i18n/locales/fr/recrutementPage';
import nsMercato from '@/lib/i18n/locales/fr/mercato';
import { usePublicFormGuard } from '@/hooks/usePublicFormGuard';
import HoneypotField from '@/components/forms/HoneypotField';
import {
  ChipGroup,
  PUBLIC_FIELD_CLASSES as C,
  TeamRankFields,
} from '@/components/Mercato/MercatoFields';
import {
  INPUT_LABEL,
  PLATFORM_LABEL,
  POSITION_LABEL,
  SOUGHT_LABEL,
} from '@/components/Mercato/mercatoLabels';
import { TEAM_OPENING_LIMITS } from '@/utils/teamOpenings';
import {
  MERCATO_INPUTS,
  MERCATO_PLATFORMS,
  MERCATO_POSITIONS,
  SOUGHT_GENDERS,
  tierIndex,
  type MercatoInput,
  type MercatoPlatform,
  type MercatoPosition,
  type RankTier,
  type SoughtGender,
} from '@/utils/mercato';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** L'annonce en cours de saisie : un seul objet plutôt qu'un état par champ. */
type OpeningDraft = {
  teamName: string;
  contactEmail: string;
  positions: MercatoPosition[];
  soughtGenders: SoughtGender[];
  level: RankTier | 'unknown';
  rankMin: RankTier | null;
  rankMax: RankTier | null;
  platforms: MercatoPlatform[];
  inputs: MercatoInput[];
  availability: string;
  note: string;
  contactDiscord: string;
};

const EMPTY_DRAFT: OpeningDraft = {
  teamName: '',
  contactEmail: '',
  positions: [],
  soughtGenders: [],
  level: 'unknown',
  rankMin: null,
  rankMax: null,
  platforms: [],
  inputs: [],
  availability: '',
  note: '',
  contactDiscord: '',
};

export default function PostOpeningForm({
  onPublished,
}: {
  /** Appelé après une publication réussie. */
  onPublished?: () => void;
}) {
  const t = useT(nsRecrutementPage);
  const tm = useT(nsMercato);

  const [form, setForm] = useState<OpeningDraft>(EMPTY_DRAFT);
  const set =
    <K extends keyof OpeningDraft>(key: K) =>
    (value: OpeningDraft[K]) =>
      setForm((f) => ({ ...f, [key]: value }));
  const {
    teamName,
    contactEmail,
    positions,
    soughtGenders,
    platforms,
    inputs,
    availability,
    note,
    contactDiscord,
  } = form;

  const guard = usePublicFormGuard();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const teamNameId = useId();
  const emailId = useId();
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

    if (teamName.trim().length < 2) return fail(t.errorTeamName);
    if (!EMAIL_RE.test(contactEmail.trim())) return fail(t.errorEmail);
    if (positions.length === 0) return fail(t.errorRoles);
    if (
      form.rankMin &&
      form.rankMax &&
      tierIndex(form.rankMin) > tierIndex(form.rankMax)
    ) {
      return fail(tm.errorRankRange);
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/public/team-openings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: teamName.trim(),
          // Les rôles historiques sont déduits des postes par l'API.
          positions,
          soughtGenders,
          level: form.level,
          rankMin: form.rankMin,
          rankMax: form.rankMax,
          platforms,
          inputs,
          availability: availability.trim() || undefined,
          note: note.trim() || undefined,
          contactEmail: contactEmail.trim(),
          contactDiscord: contactDiscord.trim() || undefined,
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

  // Écran de succès : il enchaîne sur le mercato et le Discord plutôt que de
  // laisser la capitaine dans un cul-de-sac.
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
            href="/mercato?onglet=equipes"
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
      data-test="mercato-team-form"
    >
      <div>
        <label htmlFor={teamNameId} className={C.label}>
          {t.teamNameLabel}
        </label>
        <input
          id={teamNameId}
          type="text"
          value={teamName}
          onChange={(e) => set('teamName')(e.target.value)}
          maxLength={TEAM_OPENING_LIMITS.teamName}
          placeholder={t.teamNamePlaceholder}
          className={`${C.input} mt-1`}
          required
        />
      </div>

      <ChipGroup
        legend={tm.teamPositionsLabel}
        hint={tm.multiHint}
        options={MERCATO_POSITIONS.map((p) => ({
          value: p,
          label: tm[POSITION_LABEL[p]],
        }))}
        value={positions}
        onChange={set('positions')}
      />

      <ChipGroup
        legend={tm.soughtGendersLabel}
        hint={tm.soughtGendersHint}
        options={SOUGHT_GENDERS.map((g) => ({
          value: g,
          label: tm[SOUGHT_LABEL[g]],
        }))}
        value={soughtGenders}
        onChange={set('soughtGenders')}
      />

      <TeamRankFields
        level={form.level}
        rankMin={form.rankMin}
        rankMax={form.rankMax}
        onChange={(next) => setForm((f) => ({ ...f, ...next }))}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <ChipGroup
          legend={tm.teamPlatformLabel}
          hint={tm.anyHint}
          options={MERCATO_PLATFORMS.map((p) => ({
            value: p,
            label: tm[PLATFORM_LABEL[p]],
          }))}
          value={platforms}
          onChange={set('platforms')}
        />
        <ChipGroup
          legend={tm.teamInputLabel}
          hint={tm.anyHint}
          options={MERCATO_INPUTS.map((i) => ({
            value: i,
            label: tm[INPUT_LABEL[i]],
          }))}
          value={inputs}
          onChange={set('inputs')}
        />
      </div>

      <div>
        <label htmlFor={noteId} className={C.label}>
          {tm.teamNoteLabel}
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => set('note')(e.target.value)}
          maxLength={TEAM_OPENING_LIMITS.note}
          rows={4}
          placeholder={tm.teamNotePlaceholder}
          className={`${C.input} mt-1 resize-y`}
        />
      </div>

      <div>
        <label htmlFor={availabilityId} className={C.label}>
          {t.availabilityLabel}
        </label>
        <input
          id={availabilityId}
          type="text"
          value={availability}
          onChange={(e) => set('availability')(e.target.value)}
          maxLength={TEAM_OPENING_LIMITS.availability}
          placeholder={t.availabilityPlaceholder}
          className={`${C.input} mt-1`}
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
            value={contactEmail}
            onChange={(e) => set('contactEmail')(e.target.value)}
            maxLength={TEAM_OPENING_LIMITS.contactEmail}
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
            maxLength={TEAM_OPENING_LIMITS.contactDiscord}
            placeholder={t.discordPlaceholder}
            className={`${C.input} mt-1`}
          />
          <p className={C.hint}>{t.discordHint}</p>
        </div>
      </div>

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
