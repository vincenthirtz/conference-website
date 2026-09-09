// components/Caster/NewRunPanel.tsx
//
// Panneau « Démarrer un nouveau run » de la régie (`/admin/regie`), extrait de
// la page : le garde-fou `adminFileSizeGuard` gèle regie.tsx à sa taille et
// refuse qu'elle grossisse. Rendu UNIQUEMENT à admin/owner — les endpoints
// segments exigent `manage_broadcast`, qu'un caster n'a pas.
//
// Le run peut être libre, ou pré-rempli depuis une COMPÉTITION : un tournoi
// (`from-tournament`, ordre stage→round→heure) ou un scrim (`from-scrim`, série
// entre deux équipes, ordre horaire→création). Dans les deux cas les segments
// sont ajoutés au draft AVANT le /start : si le pré-remplissage échoue, le run
// reste en draft et n'est pas démarré — pas d'état incohérent silencieux.

import { useEffect, useState } from 'react';

import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { AdminFetchError, useAdminFetch } from '@/hooks/useAdminFetch';
import { useT, format } from '@/lib/i18n/useT';
import nsRegieNewRun from '@/lib/i18n/locales/fr/regieNewRun';

/** Formate un Date en valeur `datetime-local` (fuseau local du navigateur). */
function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function NewRunPanel({
  onStarted,
}: {
  onStarted: () => Promise<void>;
}) {
  const t = useT(nsRegieNewRun);
  const { addToast } = useToast();
  // Deux (ou trois) intentions successives (create → [from-tournament] →
  // start) : la clé se régénère après chaque 2xx, chaque mutation part donc
  // avec une clé fraîche.
  const { mutateJson } = useIdempotentMutation();
  const { adminFetchJson } = useAdminFetch();

  const [name, setName] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => nowLocalInput());
  const [busy, setBusy] = useState(false);
  // Source optionnelle des segments : run libre, tournoi ou scrim. Un scrim est
  // une série entre deux équipes — ses matchs sont des lignes `matches` comme
  // celles d'un tournoi, d'où le même pré-remplissage, via `from-scrim`.
  const [source, setSource] = useState<'none' | 'tournament' | 'scrim'>('none');
  const [tournaments, setTournaments] = useState<
    { id: string; name: string }[]
  >([]);
  const [tournamentId, setTournamentId] = useState('');
  const [scrims, setScrims] = useState<{ id: string; name: string }[]>([]);
  const [scrimId, setScrimId] = useState('');

  // Charge la liste des tournois pour le sélecteur. Optionnel : en cas d'échec
  // on reste sur « run libre » sans bruit (le run 100 % libre reste possible).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await adminFetchJson<{
          tournaments: { id: string; name: string }[];
        }>('/api/admin/tournaments?limit=100&orderBy=start_date&orderDir=desc');
        if (!cancelled) setTournaments(json.tournaments ?? []);
      } catch {
        if (!cancelled) setTournaments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetchJson]);

  // Idem pour les scrims. On écarte les brouillons et les annulés : on ne
  // caste pas un scrim qui n'est pas au moins planifié. Même tolérance à
  // l'échec que la liste des tournois.
  useEffect(() => {
    if (source !== 'scrim' || scrims.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const json = await adminFetchJson<{
          scrims: { id: string; name: string; status?: string }[];
        }>('/api/admin/scrims?limit=100&orderBy=scheduled_date&orderDir=desc');
        if (cancelled) return;
        setScrims(
          (json.scrims ?? []).filter(
            (sc) => sc.status !== 'draft' && sc.status !== 'cancelled'
          )
        );
      } catch {
        if (!cancelled) setScrims([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetchJson, source, scrims.length]);

  function resetSelection() {
    setName('');
    setTournamentId('');
    setScrimId('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      addToast(t.nameRequired, 'error');
      return;
    }
    setBusy(true);
    try {
      const scheduledIso = new Date(scheduledAt).toISOString();
      const created = await mutateJson<{ id: string }>('/api/admin/events', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, scheduled_at: scheduledIso }),
      });

      // Tournoi lié : on pré-remplit les segments match AVANT le /start (les
      // segments sont ajoutés au draft). Si cet appel échoue, le run existe
      // déjà en draft : on informe l'utilisateur, on refetch (le draft
      // apparaît dans « Démarrer un run préparé ») et on NE démarre PAS —
      // pas d'état incohérent silencieux.
      const linked =
        source === 'tournament' && tournamentId
          ? {
              path: 'from-tournament',
              body: { tournament_id: tournamentId },
              one: t.segmentsCreated_one,
              other: t.segmentsCreated_other,
              fallbackError: t.fromTournamentError,
            }
          : source === 'scrim' && scrimId
            ? {
                path: 'from-scrim',
                body: { scrim_id: scrimId },
                one: t.matchesCreated_one,
                other: t.matchesCreated_other,
                fallbackError: t.fromScrimError,
              }
            : null;

      if (linked) {
        try {
          const res = await mutateJson<{
            segments: unknown[];
            created: number;
            skipped: number;
          }>(`/api/admin/events/${created.id}/segments/${linked.path}`, {
            method: 'POST',
            body: JSON.stringify(linked.body),
          });
          const count = res.created ?? 0;
          addToast(
            format(count === 1 ? linked.one : linked.other, { count }),
            'success'
          );
        } catch (fromErr) {
          const fe = fromErr as AdminFetchError;
          const feError =
            typeof fe.payload === 'object' &&
            fe.payload &&
            'error' in fe.payload
              ? String((fe.payload as { error: string }).error)
              : null;
          addToast(feError || linked.fallbackError, 'error');
          resetSelection();
          await onStarted();
          return;
        }
      }

      await mutateJson(`/api/admin/events/${created.id}/start`, {
        method: 'POST',
      });
      addToast(t.createSuccess, 'success');
      resetSelection();
      // Le run live apparaît via realtime, mais on refetch immédiatement pour
      // une transition instantanée (pas d'attente du canal).
      await onStarted();
    } catch (err) {
      const e2 = err as AdminFetchError;
      const payloadError =
        typeof e2.payload === 'object' && e2.payload && 'error' in e2.payload
          ? String((e2.payload as { error: string }).error)
          : null;
      addToast(payloadError || e2.message || t.createError, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 space-y-4"
      data-testid="regie-new-run"
    >
      <div>
        <h2 className="text-sm font-semibold text-white">{t.title}</h2>
        <p className="text-xs text-neutral-400 mt-1">{t.description}</p>
        <p className="text-[11px] text-neutral-500 mt-1">{t.tournamentHint}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-neutral-400 mb-1">
            {t.nameLabel}
          </span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder={t.namePlaceholder}
            disabled={busy}
            className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="block text-xs text-neutral-400 mb-1">
            {t.scheduledLabel}
          </span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={busy}
            className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white disabled:opacity-50"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-neutral-400 mb-1">
            {t.sourceLabel}
          </span>
          <select
            value={source}
            onChange={(e) => {
              const next = e.target.value as 'none' | 'tournament' | 'scrim';
              setSource(next);
              // Changer de source lâche la sélection de l'autre : un run ne se
              // pré-remplit que depuis une compétition à la fois.
              setTournamentId('');
              setScrimId('');
            }}
            disabled={busy}
            className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white disabled:opacity-50"
            data-testid="regie-new-run-source"
          >
            <option value="none">{t.sourceNone}</option>
            <option value="tournament">{t.sourceTournament}</option>
            <option value="scrim">{t.sourceScrim}</option>
          </select>
        </label>

        {source === 'tournament' && (
          <label className="block">
            <span className="block text-xs text-neutral-400 mb-1">
              {t.tournamentLabel}
            </span>
            <select
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              disabled={busy}
              className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white disabled:opacity-50"
              data-testid="regie-new-run-tournament"
            >
              <option value="">{t.tournamentNone}</option>
              {tournaments.map((tour) => (
                <option key={tour.id} value={tour.id}>
                  {tour.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {source === 'scrim' && (
          <label className="block">
            <span className="block text-xs text-neutral-400 mb-1">
              {t.scrimLabel}
            </span>
            <select
              value={scrimId}
              onChange={(e) => setScrimId(e.target.value)}
              disabled={busy || scrims.length === 0}
              className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white disabled:opacity-50"
              data-testid="regie-new-run-scrim"
            >
              <option value="">
                {scrims.length === 0 ? t.scrimEmpty : t.scrimNone}
              </option>
              {scrims.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy && (
          <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
        )}
        {busy ? t.submitting : t.submit}
      </button>
    </form>
  );
}
