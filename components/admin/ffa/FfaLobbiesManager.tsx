// components/admin/ffa/FfaLobbiesManager.tsx
// Gestionnaire de lobbies pour une phase FFA (Free-For-All / classement par
// points). Self-contained : liste les lobbies, permet d'en créer, d'y ajouter
// des équipes, de saisir leur placement (+ score optionnel), affiche les points
// calculés et un aperçu du classement agrégé de la phase.
//
// Volontairement isolé du moteur match team-vs-team : n'appelle QUE les
// endpoints FFA (/api/admin/stages/[stageId]/lobbies et
// /api/admin/lobbies/[lobbyId]/*).

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT } from '@/lib/i18n/useAdminT';

type Dict = ReturnType<typeof useAdminT<'adminFfa'>>;

type Placement = {
  id?: string;
  teamId: string;
  teamName: string | null;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  placement: number | null;
  points: number | null;
  score: number | null;
};

type Lobby = {
  id: string;
  name: string | null;
  round_number: number | null;
  best_of: number | null;
  status: string;
  created_at: string;
  placements: Placement[];
};

type Standing = {
  rank: number;
  teamId: string;
  totalPoints: number;
  lobbiesPlayed: number;
  bestPlacement: number | null;
  firsts: number;
  teamName: string | null;
  teamShortName: string | null;
  teamLogoUrl: string | null;
};

type LobbiesResponse = {
  stageId: string;
  lobbies: Lobby[];
  standings: Standing[];
  tiebreak: 'total_points' | 'best_placement' | 'most_firsts';
};

type RegisteredTeam = {
  team_id: string;
  team: { id: string; name: string | null; logo_url: string | null } | null;
};

type TournamentTeamsResponse = {
  teams: RegisteredTeam[];
};

type DraftEntry = {
  teamId: string;
  teamName: string | null;
  teamLogoUrl: string | null;
  placement: string;
  score: string;
};

const LOBBY_STATUSES = ['pending', 'in_progress', 'completed'] as const;

function statusLabel(status: string, t: Dict): string {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'in_progress':
      return t.statusInProgress;
    case 'completed':
      return t.statusCompleted;
    default:
      return status;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'completed':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    default:
      return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
  }
}

export default function FfaLobbiesManager({
  stageId,
  tournamentId,
}: {
  stageId: string;
  tournamentId: string;
}) {
  const t = useAdminT('adminFfa');
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [data, setData] = useState<LobbiesResponse | null>(null);
  const [registeredTeams, setRegisteredTeams] = useState<RegisteredTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingLobbyId, setSavingLobbyId] = useState<string | null>(null);

  // Working copy des placements par lobby (édition côté client).
  const [drafts, setDrafts] = useState<Record<string, DraftEntry[]>>({});
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});

  const [newLobbyName, setNewLobbyName] = useState('');
  const [newLobbyRound, setNewLobbyRound] = useState('');

  const initDrafts = useCallback((lobbies: Lobby[]) => {
    const nextDrafts: Record<string, DraftEntry[]> = {};
    const nextStatus: Record<string, string> = {};
    for (const lobby of lobbies) {
      nextDrafts[lobby.id] = lobby.placements.map((p) => ({
        teamId: p.teamId,
        teamName: p.teamName,
        teamLogoUrl: p.teamLogoUrl,
        placement: p.placement === null ? '' : String(p.placement),
        score: p.score === null ? '' : String(p.score),
      }));
      nextStatus[lobby.id] = lobby.status;
    }
    setDrafts(nextDrafts);
    setStatusDrafts(nextStatus);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lobbiesJson, teamsJson] = await Promise.all([
        adminFetchJson<LobbiesResponse>(`/api/admin/stages/${stageId}/lobbies`),
        adminFetchJson<TournamentTeamsResponse>(
          `/api/admin/tournament/${tournamentId}/teams`
        ),
      ]);
      setData(lobbiesJson);
      initDrafts(lobbiesJson.lobbies);
      setRegisteredTeams(teamsJson.teams || []);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t.errLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, stageId, tournamentId, initDrafts, t.errLoad]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateLobby() {
    setCreating(true);
    try {
      const body: { name?: string; round_number?: number } = {};
      if (newLobbyName.trim()) body.name = newLobbyName.trim();
      if (newLobbyRound.trim()) {
        const rn = Number(newLobbyRound);
        if (Number.isInteger(rn) && rn >= 1) body.round_number = rn;
      }
      await mutateJson(`/api/admin/stages/${stageId}/lobbies`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      addToast(t.toastLobbyCreated, 'success');
      setNewLobbyName('');
      setNewLobbyRound('');
      await load();
    } catch (err: unknown) {
      addToast((err as Error)?.message ?? t.errCreateLobby, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteLobby(lobby: Lobby) {
    const ok = await confirm({
      title: t.deleteLobbyTitle,
      subtitle: t.deleteLobbyConfirm,
      variant: 'danger',
      confirmLabel: t.delete,
    });
    if (!ok) return;
    try {
      await mutateJson(`/api/admin/lobbies/${lobby.id}`, { method: 'DELETE' });
      addToast(t.toastLobbyDeleted, 'success');
      await load();
    } catch (err: unknown) {
      addToast((err as Error)?.message ?? t.errDeleteLobby, 'error');
    }
  }

  function updateEntry(
    lobbyId: string,
    teamId: string,
    key: 'placement' | 'score',
    value: string
  ) {
    setDrafts((prev) => ({
      ...prev,
      [lobbyId]: (prev[lobbyId] || []).map((e) =>
        e.teamId === teamId ? { ...e, [key]: value } : e
      ),
    }));
  }

  function addTeamToLobby(lobbyId: string, teamId: string) {
    if (!teamId) return;
    const rt = registeredTeams.find((r) => r.team_id === teamId);
    setDrafts((prev) => {
      const current = prev[lobbyId] || [];
      if (current.some((e) => e.teamId === teamId)) return prev;
      return {
        ...prev,
        [lobbyId]: [
          ...current,
          {
            teamId,
            teamName: rt?.team?.name ?? null,
            teamLogoUrl: rt?.team?.logo_url ?? null,
            placement: '',
            score: '',
          },
        ],
      };
    });
  }

  function removeTeamFromLobby(lobbyId: string, teamId: string) {
    setDrafts((prev) => ({
      ...prev,
      [lobbyId]: (prev[lobbyId] || []).filter((e) => e.teamId !== teamId),
    }));
  }

  async function handleSaveLobby(lobbyId: string) {
    const entries = (drafts[lobbyId] || []).map((e) => ({
      team_id: e.teamId,
      placement: e.placement.trim() === '' ? null : Number(e.placement),
      score: e.score.trim() === '' ? null : Number(e.score),
    }));

    // Validation client : placement entier positif ou vide.
    for (const e of entries) {
      if (
        e.placement !== null &&
        (!Number.isInteger(e.placement) || e.placement < 1)
      ) {
        addToast(t.errInvalidPlacement, 'error');
        return;
      }
      if (e.score !== null && !Number.isFinite(e.score)) {
        addToast(t.errInvalidScore, 'error');
        return;
      }
    }

    setSavingLobbyId(lobbyId);
    try {
      await mutateJson(`/api/admin/lobbies/${lobbyId}/placements`, {
        method: 'PUT',
        body: JSON.stringify({
          entries,
          status: statusDrafts[lobbyId],
        }),
      });
      addToast(t.toastPlacementsSaved, 'success');
      await load();
    } catch (err: unknown) {
      addToast((err as Error)?.message ?? t.errSavePlacements, 'error');
    } finally {
      setSavingLobbyId(null);
    }
  }

  if (loading) {
    return (
      <section className="bg-neutral-800/50 backdrop-blur border border-indigo-700/40 rounded-2xl p-6">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <div className="w-4 h-4 border-2 border-neutral-600 border-t-indigo-400 rounded-full animate-spin" />
          {t.loading}
        </div>
      </section>
    );
  }

  return (
    <>
      {dialog}
      <section className="bg-neutral-800/50 backdrop-blur border border-indigo-700/40 rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="inline-flex w-8 h-8 rounded-lg bg-indigo-600/20 items-center justify-center text-indigo-300">
                ★
              </span>
              {t.lobbiesTitle}
            </h2>
            <p className="text-xs text-neutral-500 mt-1">{t.lobbiesDesc}</p>
          </div>
        </div>

        {error && (
          <div className="rounded bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Create lobby */}
        <div className="rounded-xl border border-neutral-700/60 bg-neutral-900/40 p-4">
          <h3 className="text-sm font-medium mb-3">{t.createLobby}</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-neutral-400 mb-1">
                {t.lobbyName}
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={newLobbyName}
                onChange={(e) => setNewLobbyName(e.target.value)}
                placeholder={t.lobbyNamePlaceholder}
              />
            </div>
            <div className="w-28">
              <label className="block text-xs text-neutral-400 mb-1">
                {t.roundNumber}
              </label>
              <input
                type="number"
                min={1}
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={newLobbyRound}
                onChange={(e) => setNewLobbyRound(e.target.value)}
                placeholder="—"
              />
            </div>
            <button
              type="button"
              onClick={handleCreateLobby}
              disabled={creating}
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
            >
              {creating ? t.creating : t.createLobby}
            </button>
          </div>
        </div>

        {/* Lobbies list */}
        {(!data || data.lobbies.length === 0) && (
          <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-900/30 p-8 text-center">
            <p className="text-sm text-neutral-400">{t.emptyLobbies}</p>
          </div>
        )}

        {data &&
          data.lobbies.map((lobby) => {
            const draft = drafts[lobby.id] || [];
            const usedTeamIds = new Set(draft.map((e) => e.teamId));
            const available = registeredTeams.filter(
              (rt) => !usedTeamIds.has(rt.team_id)
            );
            const savedPoints = new Map(
              lobby.placements.map((p) => [p.teamId, p.points])
            );

            return (
              <div
                key={lobby.id}
                className="rounded-xl border border-neutral-700/60 bg-neutral-900/40 p-4 space-y-4"
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      {lobby.name || t.unnamedLobby}
                    </span>
                    {lobby.round_number !== null && (
                      <span className="text-xs text-neutral-500">
                        {t.roundNumber} {lobby.round_number}
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(
                        lobby.status
                      )}`}
                    >
                      {statusLabel(lobby.status, t)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteLobby(lobby)}
                    className="text-xs text-neutral-400 hover:text-red-400"
                  >
                    {t.deleteLobby}
                  </button>
                </div>

                {/* Placements table */}
                {draft.length === 0 ? (
                  <p className="text-xs text-neutral-500">{t.emptyTeams}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-neutral-500 text-left">
                          <th className="pb-2 font-normal">{t.team}</th>
                          <th className="pb-2 font-normal w-24">
                            {t.placement}
                          </th>
                          <th className="pb-2 font-normal w-24">{t.score}</th>
                          <th className="pb-2 font-normal w-20">{t.points}</th>
                          <th className="pb-2 font-normal w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {draft.map((entry) => (
                          <tr
                            key={entry.teamId}
                            className="border-t border-neutral-800"
                          >
                            <td className="py-2 pr-2">
                              <span className="flex items-center gap-2">
                                {entry.teamLogoUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={entry.teamLogoUrl}
                                    alt=""
                                    className="w-5 h-5 rounded object-cover"
                                  />
                                )}
                                <span>
                                  {entry.teamName || entry.teamId.slice(0, 8)}
                                </span>
                              </span>
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="number"
                                min={1}
                                className="w-20 px-2 py-1 rounded bg-neutral-800 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={entry.placement}
                                onChange={(e) =>
                                  updateEntry(
                                    lobby.id,
                                    entry.teamId,
                                    'placement',
                                    e.target.value
                                  )
                                }
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="number"
                                className="w-20 px-2 py-1 rounded bg-neutral-800 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={entry.score}
                                onChange={(e) =>
                                  updateEntry(
                                    lobby.id,
                                    entry.teamId,
                                    'score',
                                    e.target.value
                                  )
                                }
                              />
                            </td>
                            <td className="py-2 pr-2 text-neutral-300">
                              {savedPoints.has(entry.teamId)
                                ? (savedPoints.get(entry.teamId) ?? '—')
                                : '—'}
                            </td>
                            <td className="py-2">
                              <button
                                type="button"
                                onClick={() =>
                                  removeTeamFromLobby(lobby.id, entry.teamId)
                                }
                                className="text-neutral-500 hover:text-red-400"
                                aria-label={t.removeTeam}
                                title={t.removeTeam}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Controls */}
                <div className="flex flex-wrap items-end gap-3 pt-1">
                  <div className="min-w-[180px]">
                    <label className="block text-xs text-neutral-400 mb-1">
                      {t.addTeam}
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value=""
                      onChange={(e) => {
                        addTeamToLobby(lobby.id, e.target.value);
                        e.target.value = '';
                      }}
                      disabled={available.length === 0}
                    >
                      <option value="">
                        {available.length === 0
                          ? t.noTeamsAvailable
                          : t.selectTeam}
                      </option>
                      {available.map((rt) => (
                        <option key={rt.team_id} value={rt.team_id}>
                          {rt.team?.name || rt.team_id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-40">
                    <label className="block text-xs text-neutral-400 mb-1">
                      {t.statusLabel}
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={statusDrafts[lobby.id] ?? lobby.status}
                      onChange={(e) =>
                        setStatusDrafts((prev) => ({
                          ...prev,
                          [lobby.id]: e.target.value,
                        }))
                      }
                    >
                      {LOBBY_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s, t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSaveLobby(lobby.id)}
                    disabled={savingLobbyId === lobby.id}
                    className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
                  >
                    {savingLobbyId === lobby.id ? t.saving : t.save}
                  </button>
                </div>
              </div>
            );
          })}

        {/* Standings preview */}
        <div className="rounded-xl border border-neutral-700/60 bg-neutral-900/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">{t.standingsTitle}</h3>
            {data && (
              <span className="text-xs text-neutral-500">
                {t.tiebreakLabel}: {tiebreakLabel(data.tiebreak, t)}
              </span>
            )}
          </div>
          {!data || data.standings.length === 0 ? (
            <p className="text-xs text-neutral-500">{t.emptyStandings}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-neutral-500 text-left">
                    <th className="pb-2 font-normal w-12">#</th>
                    <th className="pb-2 font-normal">{t.team}</th>
                    <th className="pb-2 font-normal w-24">{t.totalPoints}</th>
                    <th className="pb-2 font-normal w-24">{t.lobbiesPlayed}</th>
                    <th className="pb-2 font-normal w-24">{t.bestPlacement}</th>
                    <th className="pb-2 font-normal w-16">{t.firsts}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.standings.map((s) => (
                    <tr key={s.teamId} className="border-t border-neutral-800">
                      <td className="py-2 font-medium text-neutral-300">
                        {s.rank}
                      </td>
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          {s.teamLogoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={s.teamLogoUrl}
                              alt=""
                              className="w-5 h-5 rounded object-cover"
                            />
                          )}
                          <span>{s.teamName || s.teamId.slice(0, 8)}</span>
                        </span>
                      </td>
                      <td className="py-2 font-medium">{s.totalPoints}</td>
                      <td className="py-2 text-neutral-400">
                        {s.lobbiesPlayed}
                      </td>
                      <td className="py-2 text-neutral-400">
                        {s.bestPlacement ?? '—'}
                      </td>
                      <td className="py-2 text-neutral-400">{s.firsts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function tiebreakLabel(tiebreak: LobbiesResponse['tiebreak'], t: Dict): string {
  switch (tiebreak) {
    case 'total_points':
      return t.tiebreakTotalPoints;
    case 'most_firsts':
      return t.tiebreakMostFirsts;
    default:
      return t.tiebreakBestPlacement;
  }
}
