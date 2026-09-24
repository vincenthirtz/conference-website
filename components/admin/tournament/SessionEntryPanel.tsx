// components/admin/tournament/SessionEntryPanel.tsx
//
// Onglet Stats › Saisie : les résultats d'une SOIRÉE (journée, session de
// stream) en un seul écran — maps, map choisie par qui, bans de héros, score
// de chaque map — pour tous les matchs du jour.
//
// Rien de neuf côté écriture : chaque match réutilise l'éditeur de parties de
// la fiche match (MatchGamesPanel) et la même route
// (PUT /api/matches/[id]/games, `recomputeMode: 'from_games'`), qui recalcule
// le score du match depuis les maps, le clôt et propage le bracket. Cet écran
// ne fait que les réunir par soirée : la saisie se faisait auparavant fiche
// par fiche, ou en SQL direct sur la base.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLocale } from '@/lib/i18n/useLocale';
import { useToast } from '@/components/Toast';
import MatchGamesPanel, {
  gamesFromRows,
  type MatchGameInput,
  type MatchGameRow,
} from '@/components/admin/matches/MatchGamesPanel';
import {
  defaultSessionDay,
  groupMatchesByDay,
  needsEntry,
} from '@/utils/matches/sessionEntry';
import { parisDayKey } from '@/utils/maps/roundPools';
import nsAdminTournamentAnalytics from '@/lib/i18n/locales/admin-fr/adminTournamentAnalytics';
import nsAdminMatchEdit from '@/lib/i18n/locales/admin-fr/adminMatchEdit';

type TeamMini = {
  id: string;
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
} | null;

type EntryMatch = {
  id: string;
  scheduled_at: string | null;
  status: string;
  is_bye: boolean | null;
  round_name: string | null;
  match_format: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  team1: TeamMini;
  team2: TeamMini;
  games: MatchGameRow[] | null;
};

const TZ = 'Europe/Paris';

function dayLabel(day: string, locale: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: TZ,
  });
}

function timeLabel(iso: string | null, locale: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

function teamName(team: TeamMini): string {
  return team?.name ?? team?.short_name ?? '?';
}

export default function SessionEntryPanel() {
  const router = useRouter();
  const tournamentId = Array.isArray(router.query.id)
    ? router.query.id[0]
    : router.query.id;
  const t = useAdminT(nsAdminTournamentAnalytics);
  const tMatch = useAdminT(nsAdminMatchEdit);
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const locale = useLocale();

  const [matches, setMatches] = useState<EntryMatch[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [game, setGame] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, MatchGameInput[]>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [pools, setPools] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const todayKey = parisDayKey(new Date().toISOString()) ?? '';

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoadError(null);
    try {
      const json = await adminFetchJson<{ matches: EntryMatch[] }>(
        `/api/admin/tournament/${tournamentId}/matches?includeTeams=1&includeGames=1&orderBy=scheduled_at&orderDir=asc&limit=512`
      );
      setMatches(json.matches ?? []);
    } catch (err) {
      setLoadError((err as Error)?.message ?? t.entryLoadError);
    }
  }, [tournamentId, adminFetchJson, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Jeu du tournoi : les bans de héros n'ont de sens qu'en Overwatch.
  useEffect(() => {
    if (!tournamentId) return;
    adminFetchJson<{ tournament?: { game?: string | null } }>(
      `/api/admin/tournament/${tournamentId}`
    )
      .then((json) => setGame(json.tournament?.game ?? null))
      .catch(() => setGame(null));
  }, [tournamentId, adminFetchJson]);

  const days = useMemo(
    () => (matches ? groupMatchesByDay(matches, todayKey) : []),
    [matches, todayKey]
  );

  // Soirée par défaut, une fois : ne pas arracher l'écran à la personne qui
  // saisit quand la liste se recharge après un enregistrement.
  useEffect(() => {
    if (day === null && days.length > 0) {
      setDay(defaultSessionDay(days, todayKey));
    }
  }, [day, days, todayKey]);

  const current = days.find((d) => d.day === day) ?? null;

  // Brouillons : partis des parties en base, sauf celles qu'on est en train
  // de modifier.
  useEffect(() => {
    if (!current) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const m of current.matches) {
        if (!dirty.has(m.id)) next[m.id] = gamesFromRows(m.games ?? []);
      }
      return next;
    });
  }, [current, dirty]);

  // Suggestions de maps, par match (pool du jour > journée > tournoi).
  // Best-effort : sans pool, la saisie reste libre.
  useEffect(() => {
    if (!current) return;
    for (const m of current.matches) {
      if (pools[m.id]) continue;
      adminFetch(`/api/admin/matches/${m.id}/map-pool`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { maps?: { name: string }[] } | null) => {
          if (!json) return;
          setPools((prev) => ({
            ...prev,
            [m.id]: (json.maps ?? []).map((x) => x.name).filter(Boolean),
          }));
        })
        .catch(() => undefined);
    }
  }, [current, pools, adminFetch]);

  const setGamesFor = useCallback(
    (matchId: string) => (action: React.SetStateAction<MatchGameInput[]>) => {
      setDrafts((prev) => ({
        ...prev,
        [matchId]:
          typeof action === 'function' ? action(prev[matchId] ?? []) : action,
      }));
      setDirty((prev) => new Set(prev).add(matchId));
    },
    []
  );

  /** Enregistre un match ; `true` si c'est passé. */
  const saveMatch = useCallback(
    async (matchId: string): Promise<boolean> => {
      const games = drafts[matchId] ?? [];
      setErrors((prev) => {
        const { [matchId]: _drop, ...rest } = prev;
        return rest;
      });
      try {
        const res = await adminFetch(`/api/matches/${matchId}/games`, {
          method: 'PUT',
          body: JSON.stringify({
            games,
            // Des maps saisies font le score du match ; aucune map : on ne
            // touche pas au score existant.
            recomputeMode: games.length > 0 ? 'from_games' : 'none',
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(
            (json as { error?: string }).error ?? t.entrySaveError
          );
        }
        return true;
      } catch (err) {
        setErrors((prev) => ({
          ...prev,
          [matchId]: (err as Error)?.message ?? t.entrySaveError,
        }));
        return false;
      }
    },
    [drafts, adminFetch, t]
  );

  /**
   * Retire des « modifiés » APRÈS rechargement : dans l'autre ordre, le
   * brouillon repartirait un instant des anciennes parties.
   */
  const markSaved = useCallback((ids: string[]) => {
    setDirty((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const onSaveOne = useCallback(
    async (matchId: string) => {
      setSaving(matchId);
      const ok = await saveMatch(matchId);
      if (ok) {
        await load();
        markSaved([matchId]);
        addToast(t.entrySaved, 'success');
      }
      setSaving(null);
    },
    [saveMatch, addToast, load, markSaved, t]
  );

  const dirtyToday = current
    ? current.matches.filter((m) => dirty.has(m.id)).map((m) => m.id)
    : [];

  const onSaveAll = useCallback(async () => {
    setSaving('all');
    const saved: string[] = [];
    // L'un après l'autre : chaque enregistrement peut propager le bracket ;
    // en parallèle, deux matchs liés se marcheraient dessus.
    for (const id of dirtyToday) {
      if (await saveMatch(id)) saved.push(id);
    }
    await load();
    markSaved(saved);
    setSaving(null);
    addToast(
      format(t.entrySavedAll, { ok: saved.length, total: dirtyToday.length }),
      saved.length === dirtyToday.length ? 'success' : 'error'
    );
  }, [dirtyToday, saveMatch, addToast, load, markSaved, t]);

  if (loadError) {
    return (
      <div className="rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
        {loadError}
      </div>
    );
  }
  if (!matches) {
    return <div className="text-neutral-400 text-sm">{t.loading}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t.entryHeading}</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-400">
          {t.entrySubtitle}
        </p>
      </div>

      {days.length === 0 ? (
        <div className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-10 text-center text-sm text-neutral-400">
          {t.entryNoMatches}
        </div>
      ) : (
        <>
          {/* Soirées */}
          <div
            role="radiogroup"
            aria-label={t.entryDayLabel}
            className="flex flex-wrap gap-2"
          >
            {days.map((d) => {
              const active = d.day === day;
              return (
                <button
                  key={d.day}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDay(d.day)}
                  className={`rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-900/40 text-white'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-500'
                  }`}
                >
                  <span className="font-semibold capitalize">
                    {dayLabel(d.day, locale)}
                  </span>
                  <span className="ml-2 text-xs text-neutral-400">
                    {format(t.entryMatchCount, { count: d.matches.length })}
                  </span>
                  {d.toFill > 0 && (
                    <span className="ml-2 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
                      {format(t.entryToFill, { count: d.toFill })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {current && (
            <div className="space-y-4">
              {current.matches.map((m) => {
                const noEntry =
                  m.status === 'walkover' || !m.team1_id || !m.team2_id;
                const games = drafts[m.id] ?? [];
                const isDirty = dirty.has(m.id);
                const ties = games.filter(
                  (g) => g.team1_score === g.team2_score
                ).length;
                const todo = needsEntry(m, todayKey);
                return (
                  <section
                    key={m.id}
                    aria-label={`${teamName(m.team1)} – ${teamName(m.team2)}`}
                    className={`rounded-xl border p-4 ${
                      isDirty
                        ? 'border-blue-600/60 bg-blue-950/20'
                        : todo
                          ? 'border-amber-600/50 bg-neutral-800'
                          : 'border-neutral-700 bg-neutral-800'
                    }`}
                  >
                    <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-neutral-400">
                          {timeLabel(m.scheduled_at, locale)}
                          {m.round_name ? ` · ${m.round_name}` : ''}
                          {m.match_format
                            ? ` · ${m.match_format.toUpperCase()}`
                            : ''}
                        </p>
                        <h2 className="text-lg font-semibold">
                          {teamName(m.team1)}{' '}
                          <span className="font-mono text-neutral-300">
                            {m.team1_score ?? '–'} : {m.team2_score ?? '–'}
                          </span>{' '}
                          {teamName(m.team2)}
                        </h2>
                      </div>
                      <div className="flex items-center gap-3">
                        {isDirty && (
                          <span className="text-xs text-blue-300">
                            {t.entryUnsaved}
                          </span>
                        )}
                        <Link
                          href={`/admin/matches/${m.id}/edit`}
                          className="text-xs text-blue-400 hover:underline"
                        >
                          {t.entryOpenMatch}
                        </Link>
                      </div>
                    </header>

                    {noEntry ? (
                      <p className="text-sm text-neutral-400">
                        {m.status === 'walkover' ? t.entryForfeit : t.entryTbd}
                      </p>
                    ) : (
                      <>
                        <MatchGamesPanel
                          games={games}
                          setGames={setGamesFor(m.id)}
                          mapPool={pools[m.id] ?? []}
                          team1={m.team1}
                          team2={m.team2}
                          showPickBans={game === 'overwatch' || game === null}
                          t={tMatch as unknown as Record<string, string>}
                        />
                        {ties > 0 && (
                          <p className="mt-2 text-xs text-amber-300">
                            {format(t.entryTieWarning, { count: ties })}
                          </p>
                        )}
                        {errors[m.id] && (
                          <p className="mt-2 text-xs text-red-300">
                            {errors[m.id]}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-neutral-500">
                            {t.entryRecomputeNote}
                          </p>
                          <button
                            type="button"
                            onClick={() => void onSaveOne(m.id)}
                            disabled={!isDirty || saving !== null}
                            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40"
                          >
                            {saving === m.id ? t.entrySaving : t.entrySaveMatch}
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                );
              })}

              {dirtyToday.length > 1 && (
                <div className="sticky bottom-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void onSaveAll()}
                    disabled={saving !== null}
                    className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold shadow-lg hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {saving === 'all'
                      ? t.entrySaving
                      : format(t.entrySaveAll, { count: dirtyToday.length })}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
