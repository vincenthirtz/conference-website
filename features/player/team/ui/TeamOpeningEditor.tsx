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

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Card } from '@/features/ruban';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { format, useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsTeamOpening from '@/lib/i18n/locales/fr/teamOpening';
import nsRecrutementPage from '@/lib/i18n/locales/fr/recrutementPage';
import {
  TEAM_OPENING_LEVELS,
  TEAM_OPENING_LIMITS,
  TEAM_OPENING_ROLES,
  type TeamOpeningLevel,
  type TeamOpeningRole,
} from '@/utils/teamOpenings';
import { usePlayerErrorText } from '../../_shared/useErrorText';
import type { TeamOpeningDto } from '../openingSchemas';
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
  roles: TeamOpeningRole[];
  level: TeamOpeningLevel;
  availability: string;
  note: string;
  contactDiscord: string;
};

function draftOf(opening: TeamOpeningDto | null): Draft {
  return {
    roles: opening?.roles ?? [],
    level: opening?.level ?? 'unknown',
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

export default function TeamOpeningEditor({ editable }: { editable: boolean }) {
  const t = useT(nsTeamOpening);
  const tr = useT(nsRecrutementPage) as unknown as Record<string, string>;
  const locale = useLocale();
  const errorText = usePlayerErrorText();
  const { isInspecting } = usePlayerArea();
  const canEdit = editable && !isInspecting;

  const query = useTeamOpening(true);
  const save = useSaveTeamOpening();
  const close = useCloseTeamOpening();
  const { confirm, dialog } = useConfirmDialog();

  const opening = query.data?.opening ?? null;
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

  const toggleRole = (role: TeamOpeningRole) =>
    setDraft((d) => ({
      ...d,
      roles: d.roles.includes(role)
        ? d.roles.filter((r) => r !== role)
        : [...d.roles, role],
    }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (save.isPending) return;
    setError(null);
    setSuccess(null);
    if (draft.roles.length === 0) {
      setError(t.errorRoles);
      return;
    }
    const wasNew = !opening;
    try {
      await save.mutateAsync({
        roles: draft.roles,
        level: draft.level,
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
            {opening.roles.map((role) => (
              <span
                key={role}
                className="rounded-full border border-purple-400/40 bg-purple-500/15 px-3 py-1 text-xs font-semibold text-purple-100"
              >
                {openingRoleLabel(tr, role)}
              </span>
            ))}
            {opening.level && (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-gray-200">
                {openingLevelLabel(tr, opening.level)}
              </span>
            )}
          </div>
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
                href="/recrutement"
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
          <fieldset>
            <legend className={LABEL}>{t.rolesLabel}</legend>
            <div className="flex flex-wrap gap-2">
              {TEAM_OPENING_ROLES.map((role) => {
                const on = draft.roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleRole(role)}
                    className={`min-h-[44px] min-w-[44px] px-4 rounded-xl border text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/80 ${
                      on
                        ? 'bg-purple-600/30 border-purple-400/50 text-white'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    {openingRoleLabel(tr, role)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="team-opening-level" className={LABEL}>
              {t.levelLabel}
            </label>
            <select
              id="team-opening-level"
              value={draft.level}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  level: e.target.value as TeamOpeningLevel,
                }))
              }
              className={FIELD}
            >
              {TEAM_OPENING_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {openingLevelLabel(tr, level)}
                </option>
              ))}
            </select>
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
              {t.noteLabel}
            </label>
            <textarea
              id="team-opening-note"
              rows={3}
              value={draft.note}
              maxLength={TEAM_OPENING_LIMITS.note}
              placeholder={t.notePlaceholder}
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
