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

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/Buttons/button';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamAvailability from '@/lib/i18n/locales/admin-fr/adminTeamAvailability';
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
  const { adminFetchJson } = useAdminFetch();
  const { mutate } = useIdempotentMutation();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [constraints, setConstraints] = useState<AvailabilityConstraint[]>([]);
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetchJson<{ constraints: AvailabilityConstraint[] }>(
        `/api/admin/teams/${teamId}/availability`
      );
      setConstraints(data.constraints ?? []);
      setError(null);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, teamId, t.errorGeneric]);

  useEffect(() => {
    void load();
  }, [load]);

  // La liste des tournois n'est chargée qu'à l'ouverture du formulaire : elle ne
  // sert qu'à choisir une portée, et la fiche équipe se lit bien plus souvent
  // qu'elle ne se modifie.
  useEffect(() => {
    if (!formOpen || tournaments.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await adminFetchJson<{
          registered?: TournamentOption[];
          available?: TournamentOption[];
        }>(`/api/admin/teams/${teamId}/tournaments`);
        if (cancelled) return;
        setTournaments([...(data.registered ?? []), ...(data.available ?? [])]);
      } catch {
        // La portée « tous les tournois » reste disponible : une liste de
        // tournois indisponible ne doit pas empêcher de noter une contrainte.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formOpen, tournaments.length, adminFetchJson, teamId]);

  function resetForm() {
    setKind('blackout');
    setStartsOn('');
    setEndsOn('');
    setTimeOfDay('21:00');
    setWeekdays([]);
    setTimezone('Europe/Paris');
    setScope('');
    setNote('');
    setError(null);
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
      setError(t.errorRange);
      return;
    }

    setBusy(true);
    setError(null);
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

      const res = await mutate(`/api/admin/teams/${teamId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(t.errorGeneric);
        return;
      }
      addToast(t.addedToast, 'success');
      setFormOpen(false);
      resetForm();
      await load();
    } catch {
      setError(t.errorGeneric);
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
      const res = await mutate(
        `/api/admin/teams/${teamId}/availability?id=${c.id}`,
        { method: 'DELETE' }
      );
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
    <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="text-sm text-neutral-400 max-w-prose">{t.subtitle}</p>
        </div>
        {!formOpen && (
          <Button
            type="button"
            size="compact"
            className="px-4"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
          >
            {t.addButton}
          </Button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2"
        >
          {error}
        </p>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 border border-neutral-700 rounded-lg p-4 bg-neutral-900/40"
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
              className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm"
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
                  className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm"
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
                  className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm"
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
                className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm"
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
                      className={`px-3 py-1.5 rounded-full text-sm border ${
                        on
                          ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/50'
                          : 'bg-neutral-800 text-neutral-300 border-neutral-600'
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
                className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm"
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
                className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm"
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
              className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2 text-sm"
            />
            <span className="text-xs text-neutral-500">{t.noteHint}</span>
          </label>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="text-sm underline text-neutral-300 px-3"
            >
              {t.cancel}
            </button>
            <Button
              type="submit"
              size="compact"
              className="px-4"
              disabled={!canSubmit || busy}
            >
              {busy ? t.saving : t.save}
            </Button>
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
              className="flex items-start justify-between gap-3 border border-neutral-700 rounded-lg px-3 py-2"
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
              <button
                type="button"
                onClick={() => void handleDelete(c)}
                disabled={busyId === c.id}
                className="text-xs underline text-red-300 shrink-0 disabled:opacity-50"
              >
                {t.deleteAction}
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialog}
    </section>
  );
}
