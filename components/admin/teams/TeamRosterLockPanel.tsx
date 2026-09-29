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

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { teamsPaths } from '@/features/admin/teams/client';
import {
  teamsKeys,
  useTeamRosterLock,
} from '@/features/admin/teams/hooks/useTeamsQueries';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';

/** Mêmes durées que la fenêtre collective : le geste doit se décider vite. */
const PRESETS = [30, 120, 24 * 60] as const;

function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TeamRosterLockPanel({ teamId }: { teamId: string }) {
  const t = useAdminT(nsAdminTeamEdit);
  const { mutateJson } = useIdempotentMutation();
  const qc = useQueryClient();
  const lockQuery = useTeamRosterLock(teamId);

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const rows = lockQuery.isError ? [] : (lockQuery.data ?? null);
  const loadError = lockQuery.error
    ? lockQuery.error.message || t.rosterLockLoadError
    : null;
  const error = actionError ?? loadError;
  const load = () =>
    qc.invalidateQueries({ queryKey: teamsKeys.rosterLock(teamId) });

  const act = async (tournamentId: string, minutes: number | null) => {
    setBusy(tournamentId);
    setActionError(null);
    try {
      await mutateJson(teamsPaths.rosterLock(teamId), {
        method: minutes === null ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          minutes === null ? { tournamentId } : { tournamentId, minutes }
        ),
      });
      await load();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t.rosterLockActionError
      );
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
      className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6"
      data-testid="team-roster-lock"
    >
      <h3 className="text-[19px] text-[var(--t1,#f4edf7)]">
        {t.rosterLockTitle}
      </h3>
      <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
        {t.rosterLockIntro}
      </p>

      {error && (
        <p className="mt-2 text-xs text-[var(--err,#ff6b6b)]" role="alert">
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
              className={`rounded-[var(--r-ctrl,4px)] border p-3 ${
                r.locks
                  ? 'border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)]'
                  : 'border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.08)]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--t1,#f4edf7)]">
                    {r.tournamentName ?? r.tournamentId.slice(0, 8)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--t2,#c7bfca)]">
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
                      className="inline-flex h-[30px] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)] disabled:opacity-50"
                      data-testid={`team-roster-relock-${r.tournamentId}`}
                    >
                      {t.rosterLockRelock}
                    </button>
                  ) : openByTournament ? (
                    // Déjà ouvert pour tout le monde : rien à rouvrir. On le
                    // dit plutôt que d'offrir un bouton sans effet.
                    <span className="text-xs text-[var(--t3,#a39ba6)]">
                      {t.rosterLockAlreadyOpen}
                    </span>
                  ) : (
                    PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => void act(r.tournamentId, m)}
                        disabled={working}
                        className="inline-flex h-[30px] items-center rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.45)] px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase text-[#ffd9a3] transition-colors hover:bg-[rgba(245,165,36,.12)] disabled:opacity-50"
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
