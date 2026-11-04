// features/player/team/ui/TeamOpeningEditor.tsx — l'annonce « cette équipe
// cherche une joueuse », publiée depuis l'espace capitaine (lot P8).
//
// Avant : la capitaine connectée devait repasser par le formulaire public de
// /recrutement (captcha, email, lien de retrait par email) et son annonce
// restait orpheline (`team_id` NULL), donc sans badge dans l'annuaire. Ici
// l'annonce naît rattachée à l'équipe, et se met à jour ou se clôt sur place.
//
// Visible pour toute membre qui peut la lire (la route exige la permission de
// recrutement : un 403 masque simplement le bloc) ; éditable seulement si
// `editable` et hors inspection staff.
//
// Hub mercato : mêmes champs que le formulaire public /mercato/equipe (postes
// fins, profils recherchés, rang moyen + fourchette, plateformes, contrôles,
// description et but du recrutement), mêmes composants (MercatoFields).

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Card } from '@/features/ruban';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { format, useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsTeamOpening from '@/lib/i18n/locales/fr/teamOpening';
import nsRecrutementPage from '@/lib/i18n/locales/fr/recrutementPage';
import nsMercato from '@/lib/i18n/locales/fr/mercato';
import {
  TEAM_OPENING_LIMITS,
  type TeamOpeningLevel,
  type TeamOpeningRole,
} from '@/utils/teamOpenings';
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
import {
  ChipGroup,
  TeamRankFields,
  type FieldClasses,
} from '@/components/Mercato/MercatoFields';
import {
  INPUT_LABEL,
  PLATFORM_LABEL,
  POSITION_LABEL,
  SOUGHT_LABEL,
  openingRankLabel,
} from '@/components/Mercato/mercatoLabels';
import { withOpeningDefaults } from '@/components/Mercato/defaults';
import { usePlayerErrorText } from '../../_shared/useErrorText';
import type { TeamOpeningDto } from '../opening/schemas';
import {
  useCloseTeamOpening,
  useSaveTeamOpening,
  useTeamOpening,
} from '../hooks/useTeamOpening';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Libellés partagés avec le formulaire public (/recrutement). */
export function openingRoleLabel(
  tr: Record<string, string>,
  role: TeamOpeningRole
): string {
  return tr[`role${cap(role)}`] ?? role;
}
export function openingLevelLabel(
  tr: Record<string, string>,
  level: TeamOpeningLevel
): string {
  return tr[`level${cap(level)}`] ?? level;
}

type Draft = {
  /** Rôles historiques : renvoyés tels quels tant qu'aucun poste fin n'est choisi. */
  roles: TeamOpeningRole[];
  positions: MercatoPosition[];
  soughtGenders: SoughtGender[];
  level: TeamOpeningLevel;
  rankMin: RankTier | null;
  rankMax: RankTier | null;
  platforms: MercatoPlatform[];
  inputs: MercatoInput[];
  availability: string;
  note: string;
  contactDiscord: string;
};

function draftOf(opening: TeamOpeningDto | null): Draft {
  return {
    roles: opening?.roles ?? [],
    positions: opening?.positions ?? [],
    soughtGenders: opening?.soughtGenders ?? [],
    level: opening?.level ?? 'unknown',
    rankMin: opening?.rankMin ?? null,
    rankMax: opening?.rankMax ?? null,
    platforms: opening?.platforms ?? [],
    inputs: opening?.inputs ?? [],
    availability: opening?.availability ?? '',
    note: opening?.note ?? '',
    contactDiscord: opening?.contactDiscord ?? '',
  };
}

function errorCode(err: unknown): string | null {
  const payload = (err as { payload?: { code?: unknown } } | null)?.payload;
  return typeof payload?.code === 'string' ? payload.code : null;
}

const FIELD =
  'w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80';
const LABEL =
  'block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2';
/** Habillage de l'espace capitaine pour les champs partagés du mercato. */
const CAPTAIN_FIELDS: FieldClasses = {
  label: 'block text-xs font-medium tracking-[0.12em] uppercase text-gray-300',
  hint: 'mt-1 text-xs text-gray-400',
  input: FIELD,
};

export default function TeamOpeningEditor({ editable }: { editable: boolean }) {
  const t = useT(nsTeamOpening);
  const tr = useT(nsRecrutementPage) as unknown as Record<string, string>;
  const tm = useT(nsMercato);
  const locale = useLocale();
  const errorText = usePlayerErrorText();
  const { isInspecting } = usePlayerArea();
  const canEdit = editable && !isInspecting;

  const query = useTeamOpening(true);
  const save = useSaveTeamOpening();
  const close = useCloseTeamOpening();
  const { confirm, dialog } = useConfirmDialog();

  const rawOpening = query.data?.opening ?? null;
  // Complétée si l'API ne porte pas encore les champs du mercato (cf.
  // components/Mercato/defaults.ts). Mémoïsée : l'effet de brouillon ci-dessous
  // dépend de son identité.
  const opening = useMemo(
    () => (rawOpening ? withOpeningDefaults(rawOpening) : null),
    [rawOpening]
  );
  const accountEmail = query.data?.accountEmail ?? null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(null));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Le brouillon suit l'annonce serveur tant qu'on n'est pas en train d'éditer.
  useEffect(() => {
    if (!editing) setDraft(draftOf(opening));
  }, [opening, editing]);

  // 403 = pas la permission de recrutement : le bloc n'a rien à montrer.
  const forbidden = (query.error as { status?: number } | null)?.status === 403;
  if (forbidden) return null;
  if (!canEdit && query.isSuccess && !opening) return null;

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (save.isPending) return;
    setError(null);
    setSuccess(null);
    if (draft.positions.length === 0 && draft.roles.length === 0) {
      setError(t.errorRoles);
      return;
    }
    if (
      draft.rankMin &&
      draft.rankMax &&
      tierIndex(draft.rankMin) > tierIndex(draft.rankMax)
    ) {
      setError(tm.errorRankRange);
      return;
    }
    const wasNew = !opening;
    try {
      await save.mutateAsync({
        // Une annonce d'avant le mercato garde ses rôles tant qu'aucun poste
        // fin n'est choisi ; sinon l'API les déduit des postes.
        roles: draft.positions.length === 0 ? draft.roles : undefined,
        positions: draft.positions,
        soughtGenders: draft.soughtGenders,
        level: draft.level,
        rankMin: draft.rankMin,
        rankMax: draft.rankMax,
        platforms: draft.platforms,
        inputs: draft.inputs,
        availability: draft.availability.trim() || null,
        note: draft.note.trim() || null,
        contactDiscord: draft.contactDiscord.trim() || null,
      });
      setEditing(false);
      setSuccess(wasNew ? t.published : t.updated);
    } catch (err) {
      setError(
        errorCode(err) === 'NO_CONTACT_EMAIL'
          ? t.noContactEmail
          : errorText(err, t.saveError)
      );
    }
  };

  const closeOpening = async () => {
    const ok = await confirm({
      title: t.closeConfirmTitle,
      subtitle: t.closeConfirmSubtitle,
      variant: 'warning',
      confirmLabel: t.closeConfirmYes,
      cancelLabel: t.closeConfirmNo,
    });
    if (!ok) return;
    setError(null);
    setSuccess(null);
    try {
      await close.mutateAsync(undefined);
      setEditing(false);
      setSuccess(t.closed);
    } catch (err) {
      setError(errorText(err, t.closeError));
    }
  };

  const showForm = canEdit && (editing || !opening);
  const busy = save.isPending || close.isPending;

  return (
    <Card as="section" aria-labelledby="team-opening-title">
      {dialog}
      <h2 id="team-opening-title" className="text-lg font-semibold">
        {t.title}
      </h2>
      <p className="text-sm text-gray-400 mt-1 mb-4">{t.intro}</p>

      {query.isError && (
        <p role="alert" className="text-sm text-red-300 mb-3">
          {t.loadError}
        </p>
      )}

      {opening && !showForm && (
        <div className="space-y-2 text-sm">
          {!opening.active && (
            <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-200">
              {t.expired}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(opening.positions.length > 0
              ? opening.positions.map((p) => tm[POSITION_LABEL[p]])
              : opening.roles.map((role) => openingRoleLabel(tr, role))
            ).map((label) => (
              <span
                key={label}
                className="rounded-full border border-purple-400/40 bg-purple-500/15 px-3 py-1 text-xs font-semibold text-purple-100"
              >
                {label}
              </span>
            ))}
            {(openingRankLabel(tm, opening) ||
              (opening.level && openingLevelLabel(tr, opening.level))) && (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-gray-200">
                {openingRankLabel(tm, opening) ||
                  openingLevelLabel(tr, opening.level as TeamOpeningLevel)}
              </span>
            )}
          </div>
          {(opening.soughtGenders.length > 0 ||
            opening.platforms.length > 0 ||
            opening.inputs.length > 0) && (
            <p className="text-xs text-gray-300">
              {[
                ...opening.soughtGenders.map((g) => tm[SOUGHT_LABEL[g]]),
                ...opening.platforms.map((x) => tm[PLATFORM_LABEL[x]]),
                ...opening.inputs.map((x) => tm[INPUT_LABEL[x]]),
              ].join(' · ')}
            </p>
          )}
          {opening.availability && (
            <p className="text-gray-300">{opening.availability}</p>
          )}
          {opening.note && (
            <p className="text-gray-400 italic">{opening.note}</p>
          )}
          <p className="text-xs text-gray-400">
            {format(t.since, { date: fmtDate(opening.since) })}
            {opening.active && opening.expiresAt && (
              <> · {format(t.expires, { date: fmtDate(opening.expiresAt) })}</>
            )}
          </p>
          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSuccess(null);
                  setEditing(true);
                }}
                disabled={busy}
                className="min-h-[44px] px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition disabled:opacity-50"
              >
                {t.edit}
              </button>
              <button
                type="button"
                onClick={() => void closeOpening()}
                disabled={busy}
                className="min-h-[44px] px-4 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-200 text-sm font-semibold transition disabled:opacity-50"
              >
                {t.close}
              </button>
              <Link
                href="/mercato?onglet=equipes"
                className="inline-flex min-h-[44px] items-center px-4 text-sm text-purple-300 hover:text-purple-200 underline"
              >
                {t.viewPublic}
              </Link>
            </div>
          )}
        </div>
      )}

      {!opening && !showForm && query.isSuccess && (
        <p className="text-sm text-gray-400">{t.none}</p>
      )}

      {showForm && query.isSuccess && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <ChipGroup
            legend={t.rolesLabel}
            hint={tm.multiHint}
            classes={CAPTAIN_FIELDS}
            options={MERCATO_POSITIONS.map((p) => ({
              value: p,
              label: tm[POSITION_LABEL[p]],
            }))}
            value={draft.positions}
            onChange={(positions) => setDraft((d) => ({ ...d, positions }))}
          />

          <ChipGroup
            legend={tm.soughtGendersLabel}
            hint={tm.soughtGendersHint}
            classes={CAPTAIN_FIELDS}
            options={SOUGHT_GENDERS.map((g) => ({
              value: g,
              label: tm[SOUGHT_LABEL[g]],
            }))}
            value={draft.soughtGenders}
            onChange={(soughtGenders) =>
              setDraft((d) => ({ ...d, soughtGenders }))
            }
          />

          <TeamRankFields
            classes={CAPTAIN_FIELDS}
            level={draft.level}
            rankMin={draft.rankMin}
            rankMax={draft.rankMax}
            onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <ChipGroup
              legend={tm.teamPlatformLabel}
              hint={tm.anyHint}
              classes={CAPTAIN_FIELDS}
              options={MERCATO_PLATFORMS.map((p) => ({
                value: p,
                label: tm[PLATFORM_LABEL[p]],
              }))}
              value={draft.platforms}
              onChange={(platforms) => setDraft((d) => ({ ...d, platforms }))}
            />
            <ChipGroup
              legend={tm.teamInputLabel}
              hint={tm.anyHint}
              classes={CAPTAIN_FIELDS}
              options={MERCATO_INPUTS.map((i) => ({
                value: i,
                label: tm[INPUT_LABEL[i]],
              }))}
              value={draft.inputs}
              onChange={(inputs) => setDraft((d) => ({ ...d, inputs }))}
            />
          </div>

          <div>
            <label htmlFor="team-opening-availability" className={LABEL}>
              {t.availabilityLabel}
            </label>
            <input
              id="team-opening-availability"
              type="text"
              value={draft.availability}
              maxLength={TEAM_OPENING_LIMITS.availability}
              placeholder={t.availabilityPlaceholder}
              onChange={(e) =>
                setDraft((d) => ({ ...d, availability: e.target.value }))
              }
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="team-opening-note" className={LABEL}>
              {tm.teamNoteLabel}
            </label>
            <textarea
              id="team-opening-note"
              rows={4}
              value={draft.note}
              maxLength={TEAM_OPENING_LIMITS.note}
              placeholder={tm.teamNotePlaceholder}
              onChange={(e) =>
                setDraft((d) => ({ ...d, note: e.target.value }))
              }
              className={`${FIELD} resize-none`}
            />
          </div>

          <div>
            <label htmlFor="team-opening-discord" className={LABEL}>
              {t.discordLabel}
            </label>
            <input
              id="team-opening-discord"
              type="text"
              value={draft.contactDiscord}
              maxLength={TEAM_OPENING_LIMITS.contactDiscord}
              onChange={(e) =>
                setDraft((d) => ({ ...d, contactDiscord: e.target.value }))
              }
              className={FIELD}
            />
            {/* Le partage du contact se dit AVANT la publication. Une annonce
                existante garde le contact de qui l'a publiée. */}
            <p className="mt-2 text-xs text-gray-400">
              {opening?.contactEmail || accountEmail
                ? format(t.contactNotice, {
                    email: (opening?.contactEmail || accountEmail) as string,
                  })
                : t.noContactEmail}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-sm font-semibold transition disabled:opacity-50"
            >
              {save.isPending ? t.saving : opening ? t.update : t.publish}
            </button>
            {opening && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                disabled={busy}
                className="min-h-[44px] px-4 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm transition disabled:opacity-50"
              >
                {t.cancelEdit}
              </button>
            )}
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-3 text-sm text-emerald-300">
          {success}
        </p>
      )}
    </Card>
  );
}
