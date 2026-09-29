// components/admin/teams/TeamAvailabilityPanel.tsx
//
// Saisie des contraintes de disponibilité d'une équipe — lot 2 de
// docs/PLAN-plateforme-tournois.md. Rendu dans la fiche équipe admin.
//
// Endpoints :
//   GET    /api/admin/teams/[teamId]/availability
//   POST   /api/admin/teams/[teamId]/availability
//   DELETE /api/admin/teams/[teamId]/availability?id=<uuid>
//
// Pourquoi ici. Une contrainte se recueille au moment où l'on parle à l'équipe,
// pas au moment où l'on planifie : la fiche équipe est l'écran ouvert pendant
// cette conversation. Les lots 3 à 6 la consomment ailleurs, ils ne la saisissent
// pas — un même fait ne doit avoir qu'un seul endroit où on l'écrit.
//
// Pas de modification en place (PATCH existe côté API, pas côté écran) : une
// contrainte est courte, et « supprimer puis ré-ajouter » laisse deux lignes
// nettes dans le journal staff là où une édition silencieuse en laisserait une
// ambiguë.

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamAvailability from '@/lib/i18n/locales/admin-fr/adminTeamAvailability';
import { teamsPaths } from '@/features/admin/teams/client';
import {
  teamsKeys,
  useTeamAvailability,
  useTeamTournaments,
} from '@/features/admin/teams/hooks/useTeamsQueries';
import { TOURNAMENT_TIMEZONES } from '@/utils/timezone';
import { describeConstraint } from '@/utils/matches/availabilityRows';
import type {
  AvailabilityConstraint,
  AvailabilityConstraintKind,
} from '@/utils/matches/availability';

type TournamentOption = { id: string; name: string };

const KINDS: AvailabilityConstraintKind[] = [
  'blackout',
  'earliest',
  'latest',
  'weekday',
];

export default function TeamAvailabilityPanel({ teamId }: { teamId: string }) {
  const t = useAdminT(nsAdminTeamAvailability);
  const { mutate } = useIdempotentMutation();
  const qc = useQueryClient();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // État du formulaire. Un seul objet plutôt qu'un state par champ : la nature
  // pilote quels champs comptent, et les remettre à plat à chaque bascule
  // demande de les tenir ensemble.
  const [kind, setKind] = useState<AvailabilityConstraintKind>('blackout');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('21:00');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [timezone, setTimezone] = useState('Europe/Paris');
  const [scope, setScope] = useState('');
  const [note, setNote] = useState('');

  const weekdayLabels = useMemo(
    () => [
      '',
      t.monday,
      t.tuesday,
      t.wednesday,
      t.thursday,
      t.friday,
      t.saturday,
      t.sunday,
    ],
    [t]
  );

  const availabilityQuery = useTeamAvailability(teamId);
  const constraints: AvailabilityConstraint[] = availabilityQuery.data ?? [];
  const loading = availabilityQuery.isPending;
  // Erreur de lecture OU d'enregistrement, rendue au même endroit.
  const error =
    formError ?? (availabilityQuery.isError ? t.errorGeneric : null);
  const load = () =>
    qc.invalidateQueries({ queryKey: teamsKeys.availability(teamId) });

  // La liste des tournois n'est chargée qu'à l'ouverture du formulaire : elle ne
  // sert qu'à choisir une portée, et la fiche équipe se lit bien plus souvent
  // qu'elle ne se modifie. Même clé que la section Tournois de l'édition : une
  // seule requête pour les deux. En échec, la portée « tous les tournois »
  // reste disponible.
  const tournamentsQuery = useTeamTournaments(teamId, formOpen);
  const tournaments = useMemo<TournamentOption[]>(
    () => [
      ...(tournamentsQuery.data?.registered ?? []),
      ...(tournamentsQuery.data?.available ?? []),
    ],
    [tournamentsQuery.data]
  );

  function resetForm() {
    setKind('blackout');
    setStartsOn('');
    setEndsOn('');
    setTimeOfDay('21:00');
    setWeekdays([]);
    setTimezone('Europe/Paris');
    setScope('');
    setNote('');
    setFormError(null);
  }

  const kindLabel = (k: AvailabilityConstraintKind): string =>
    k === 'blackout'
      ? t.kindBlackout
      : k === 'earliest'
        ? t.kindEarliest
        : k === 'latest'
          ? t.kindLatest
          : t.kindWeekday;

  const canSubmit =
    kind === 'blackout'
      ? Boolean(startsOn && endsOn)
      : kind === 'weekday'
        ? weekdays.length > 0
        : Boolean(timeOfDay);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;

    if (kind === 'blackout' && endsOn < startsOn) {
      setFormError(t.errorRange);
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        kind,
        timezone,
        tournament_id: scope || null,
        note: note.trim() || null,
      };
      if (kind === 'blackout') {
        body.starts_on = startsOn;
        body.ends_on = endsOn;
      } else if (kind === 'weekday') {
        body.weekdays = [...weekdays].sort((a, b) => a - b);
      } else {
        body.time_of_day = timeOfDay;
      }

      const res = await mutate(teamsPaths.availability(teamId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setFormError(t.errorGeneric);
        return;
      }
      addToast(t.addedToast, 'success');
      setFormOpen(false);
      resetForm();
      await load();
    } catch {
      setFormError(t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(c: AvailabilityConstraint) {
    const ok = await confirm({
      title: t.deleteTitle,
      subtitle: describeConstraint(c),
      body: t.deleteBody,
      variant: 'danger',
      confirmLabel: t.deleteConfirm,
    });
    if (!ok) return;

    setBusyId(c.id);
    try {
      const res = await mutate(teamsPaths.availabilityItem(teamId, c.id), {
        method: 'DELETE',
      });
      if (!res.ok) {
        addToast(t.errorGeneric, 'error');
        return;
      }
      addToast(t.deletedToast, 'success');
      await load();
    } catch {
      addToast(t.errorGeneric, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="bg-[var(--s1,#100812)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-card,14px)] p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="text-sm text-neutral-400 max-w-prose">{t.subtitle}</p>
        </div>
        {!formOpen && (
          <AdminButton
            variant="secondary"
            size="sm"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
          >
            {t.addButton}
          </AdminButton>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-[var(--r-ctrl,4px)] px-3 py-2"
        >
          {error}
        </p>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-ctrl,4px)] p-4 bg-[var(--s2,#1d1520)]"
        >
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-[0.12em] text-neutral-400">
              {t.kindLabel}
            </span>
            <select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as AvailabilityConstraintKind)
              }
              className="w-full bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-ctrl,4px)] px-3 py-2 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </label>

          {kind === 'blackout' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                  {t.startsOn}
                </span>
                <input
                  type="date"
                  required
                  value={startsOn}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartsOn(v);
                    // Un blackout d'un seul jour est le cas le plus fréquent :
                    // pré-remplir la fin évite d'avoir à saisir deux fois la
                    // même date, sans empêcher de l'étendre.
                    if (!endsOn || endsOn < v) setEndsOn(v);
                  }}
                  className="w-full bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-ctrl,4px)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                  {t.endsOn}
                </span>
                <input
                  type="date"
                  required
                  min={startsOn || undefined}
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  className="w-full bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-ctrl,4px)] px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {(kind === 'earliest' || kind === 'latest') && (
            <label className="block space-y-1 sm:max-w-[12rem]">
              <span className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                {t.timeOfDay}
              </span>
              <input
                type="time"
                required
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-ctrl,4px)] px-3 py-2 text-sm"
              />
            </label>
          )}

          {kind === 'weekday' && (
            <fieldset className="space-y-1">
              <legend className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                {t.weekdays}
              </legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setWeekdays((prev) =>
                          prev.includes(d)
                            ? prev.filter((x) => x !== d)
                            : [...prev, d]
                        )
                      }
                      className={`px-3 py-1.5 rounded-[var(--r-ctrl,4px)] text-sm border ${
                        on
                          ? 'bg-[rgba(180,103,209,.12)] text-[var(--or-200,#eec4ff)] border-[var(--or,#b467d1)]'
                          : 'bg-[var(--s2,#1d1520)] text-[var(--t2,#c7bfca)] border-[var(--line2,rgba(194,196,201,.2))]'
                      }`}
                    >
                      {weekdayLabels[d]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                {t.timezone}
              </span>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-ctrl,4px)] px-3 py-2 text-sm"
              >
                {TOURNAMENT_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-neutral-500">{t.timezoneHint}</span>
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                {t.scope}
              </span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-ctrl,4px)] px-3 py-2 text-sm"
              >
                <option value="">{t.scopeAll}</option>
                {tournaments.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-neutral-500">
                {scope ? ' ' : t.scopeAllHint}
              </span>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-[0.12em] text-neutral-400">
              {t.note}
            </span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.notePlaceholder}
              className="w-full bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-ctrl,4px)] px-3 py-2 text-sm"
            />
            <span className="text-xs text-neutral-500">{t.noteHint}</span>
          </label>

          <div className="flex gap-2 justify-end">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
            >
              {t.cancel}
            </AdminButton>
            <AdminButton
              type="submit"
              variant="primary"
              size="sm"
              disabled={!canSubmit || busy}
            >
              {busy ? t.saving : t.save}
            </AdminButton>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-neutral-300 text-sm">{t.loading}</p>
      ) : constraints.length === 0 ? (
        <div className="space-y-1">
          <p className="text-neutral-300 text-sm">{t.empty}</p>
          <p className="text-neutral-500 text-xs">{t.emptyHint}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {constraints.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-ctrl,4px)] px-3 py-2"
            >
              <div className="space-y-1 min-w-0">
                <p className="text-sm text-neutral-100">
                  {describeConstraint(c)}{' '}
                  <span className="text-xs text-neutral-500">
                    ({c.timezone})
                  </span>
                </p>
                <p className="text-xs text-neutral-500">
                  {c.tournamentId ? '' : `${t.scopeBadgeAll} · `}
                  {c.note || ''}
                </p>
              </div>
              <AdminButton
                variant="danger"
                size="xs"
                onClick={() => void handleDelete(c)}
                disabled={busyId === c.id}
              >
                {t.deleteAction}
              </AdminButton>
            </li>
          ))}
        </ul>
      )}

      {dialog}
    </section>
  );
}
