// components/admin/teams/TeamRosterLockPanel.tsx
//
// Verrou de roster, vu depuis l'ÉQUIPE.
//
// Le tableau de bord du tournoi ouvre une fenêtre pour toutes ses équipes.
// C'est le bon geste quand le motif est collectif. Ici, le motif tient à une
// équipe — « une joueuse s'est blessée chez les Alpha » — et rouvrir le roster
// de tout le monde la veille des matchs serait une réponse disproportionnée.
//
// Le panneau liste donc les tournois qui verrouillent CETTE équipe, et ouvre
// une fenêtre par inscription. Il affiche aussi les fenêtres collectives en
// cours, pour que l'admin ne rouvre pas ce qui est déjà ouvert — et comprenne
// pourquoi le roster passe alors qu'il n'a rien fait.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';

/** Mêmes durées que la fenêtre collective : le geste doit se décider vite. */
const PRESETS = [30, 120, 24 * 60] as const;

type Row = {
  tournamentId: string;
  tournamentName: string | null;
  rosterLockedAt: string | null;
  lockApplies: boolean;
  tournamentUnlockedUntil: string | null;
  teamUnlockedUntil: string | null;
  locks: boolean;
};

function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TeamRosterLockPanel({ teamId }: { teamId: string }) {
  const t = useAdminT(nsAdminTeamEdit);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<{ tournaments: Row[] }>(
        `/api/admin/teams/${teamId}/roster-lock`
      );
      setRows(data.tournaments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.rosterLockLoadError);
      setRows([]);
    }
  }, [adminFetchJson, teamId, t.rosterLockLoadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (tournamentId: string, minutes: number | null) => {
    setBusy(tournamentId);
    setError(null);
    try {
      await mutateJson(`/api/admin/teams/${teamId}/roster-lock`, {
        method: minutes === null ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          minutes === null ? { tournamentId } : { tournamentId, minutes }
        ),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.rosterLockActionError);
    } finally {
      setBusy(null);
    }
  };

  // Un tournoi sans verrou en vue n'a rien à dire ici : l'écran d'édition est
  // déjà dense, et lister des lignes « rien à signaler » noierait celles qui
  // demandent une décision.
  const relevant = (rows ?? []).filter(
    (r) => r.lockApplies || r.teamUnlockedUntil || r.tournamentUnlockedUntil
  );

  if (rows === null || relevant.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-4"
      data-testid="team-roster-lock"
    >
      <h3 className="text-sm font-semibold text-white">{t.rosterLockTitle}</h3>
      <p className="mt-1 text-xs text-neutral-400">{t.rosterLockIntro}</p>

      {error && (
        <p className="mt-2 text-xs text-red-300" role="alert">
          {error}
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {relevant.map((r) => {
          const openByTeam = r.teamUnlockedUntil;
          const openByTournament = r.tournamentUnlockedUntil;
          const working = busy === r.tournamentId;

          return (
            <li
              key={r.tournamentId}
              className={`rounded-xl border p-3 ${
                r.locks
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : 'border-emerald-500/40 bg-emerald-500/10'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">
                    {r.tournamentName ?? r.tournamentId.slice(0, 8)}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-300">
                    {r.locks
                      ? t.rosterLockLocked
                      : openByTeam
                        ? format(t.rosterLockOpenTeam, {
                            time: shortTime(openByTeam),
                          })
                        : openByTournament
                          ? format(t.rosterLockOpenTournament, {
                              time: shortTime(openByTournament),
                            })
                          : t.rosterLockNotLocked}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {openByTeam ? (
                    <button
                      type="button"
                      onClick={() => void act(r.tournamentId, null)}
                      disabled={working}
                      className="rounded-lg border border-neutral-500/60 px-3 py-1.5 text-xs text-neutral-100 hover:border-neutral-300 disabled:opacity-50"
                      data-testid={`team-roster-relock-${r.tournamentId}`}
                    >
                      {t.rosterLockRelock}
                    </button>
                  ) : openByTournament ? (
                    // Déjà ouvert pour tout le monde : rien à rouvrir. On le
                    // dit plutôt que d'offrir un bouton sans effet.
                    <span className="text-xs text-neutral-400">
                      {t.rosterLockAlreadyOpen}
                    </span>
                  ) : (
                    PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => void act(r.tournamentId, m)}
                        disabled={working}
                        className="rounded-lg bg-amber-500/80 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
                        data-testid={`team-roster-unlock-${m}`}
                      >
                        {m < 60
                          ? format(t.rosterLockMinutes, { n: m })
                          : m < 24 * 60
                            ? format(t.rosterLockHours, { n: m / 60 })
                            : format(t.rosterLockDays, { n: m / (24 * 60) })}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
