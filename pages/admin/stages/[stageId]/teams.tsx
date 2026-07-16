import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import StageTabsNav from '@/components/admin/stages/StageTabsNav';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../../utils/logger';
type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};
type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

type StageTeam = {
  stage_id: string;
  team_id: string;
  seed: number | null;
  is_substitute: boolean | null;
  notes: string | null;
  team: {
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
  } | null;
};

type StageTeamsApiResponse = {
  stageId: string;
  stage: {
    id: string;
    tournament_id: string;
    name: string;
    stage_type: StageType | null;
  };
  tournament: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
  teams: StageTeam[];
};

type TournamentTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type TournamentTeamsApiResponse = {
  tournamentId: string;
  teams: TournamentTeam[];
};

export const getServerSideProps = withStaffPage('admin');

function AdminStageTeamsPage({ staff }: StaffProps) {
  const t = useAdminT('adminStageTeams');
  const router = useRouter();
  const { stageId } = router.query;
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson: addTeamMutate } = useIdempotentMutation();

  const [loading, setLoading] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [stage, setStage] = useState<StageTeamsApiResponse['stage'] | null>(
    null
  );
  const [tournament, setTournament] = useState<
    StageTeamsApiResponse['tournament'] | null
  >(null);
  const [stageTeams, setStageTeams] = useState<StageTeam[]>([]);
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeam[]>([]);

  // Ajout
  const [addTeamId, setAddTeamId] = useState('');
  const [addSeed, setAddSeed] = useState('');
  const [adding, setAdding] = useState(false);

  // Suppression
  const [removingTeamId, setRemovingTeamId] = useState<string | null>(null);

  // Seed inline
  const [updatingSeedId, setUpdatingSeedId] = useState<string | null>(null);
  const [seedInputs, setSeedInputs] = useState<Record<string, string>>({});

  // Bulk seed
  const [bulkSeedSaving, setBulkSeedSaving] = useState(false);

  // Bulk selection (pour retrait en masse)
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(
    new Set()
  );
  const [bulkRemoving, setBulkRemoving] = useState(false);

  const fetchTournamentTeams = useCallback(
    async (tournamentId: string) => {
      setLoadingTeams(true);
      try {
        const json = await adminFetchJson<TournamentTeamsApiResponse>(
          `/api/admin/tournament/${tournamentId}/teams`
        );
        setTournamentTeams(json.teams || []);
      } catch (err) {
        logger.error('fetchTournamentTeams error', err);
      } finally {
        setLoadingTeams(false);
      }
    },
    [adminFetchJson]
  );

  const fetchStageTeams = useCallback(async () => {
    if (!stageId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const json = await adminFetchJson<StageTeamsApiResponse>(
        `/api/admin/stages/${stageId}/teams`
      );
      setStage(json.stage);
      setTournament(json.tournament);
      setStageTeams(json.teams || []);

      // Init des seeds dans les inputs
      const seedMap: Record<string, string> = {};
      (json.teams || []).forEach((st) => {
        seedMap[st.team_id] = st.seed != null ? String(st.seed) : '';
      });
      setSeedInputs(seedMap);
      setSelectedTeamIds(new Set());

      // Charger les équipes du tournoi parent
      if (json.stage?.tournament_id) {
        fetchTournamentTeams(json.stage.tournament_id);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setLoading(false);
    }
  }, [stageId, adminFetchJson, t, fetchTournamentTeams]);

  useEffect(() => {
    if (!stageId) return;
    fetchStageTeams();
    // adminFetchJson et t sont désormais stables : fetchStageTeams ne varie
    // qu'avec stageId → un seul chargement par stageId, sans refetch parasite.
  }, [stageId, fetchStageTeams]);

  const availableTeamsForAdd = useMemo(() => {
    const inStageIds = new Set(stageTeams.map((st) => st.team_id));
    return tournamentTeams.filter((team) => !inStageIds.has(team.id));
  }, [stageTeams, tournamentTeams]);

  async function handleAddTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!stageId) return;
    if (!addTeamId) {
      setErrorMsg(t.errSelectTeam);
      return;
    }

    setAdding(true);
    setErrorMsg(null);

    const seed = addSeed.trim() !== '' ? Number(addSeed) : null;

    try {
      await addTeamMutate(`/api/admin/stages/${stageId}/teams`, {
        method: 'POST',
        body: JSON.stringify({
          teamId: addTeamId,
          seed,
        }),
      });

      addToast(t.toastAdded, 'info');
      setAddTeamId('');
      setAddSeed('');
      fetchStageTeams();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errAdd);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveTeam(teamId: string) {
    if (!stageId) return;
    setRemovingTeamId(teamId);
    setErrorMsg(null);

    try {
      await adminFetchJson(`/api/admin/stages/${stageId}/teams`, {
        method: 'DELETE',
        body: JSON.stringify({ teamId }),
      });
      addToast(t.toastRemoved, 'info');
      fetchStageTeams();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errRemove);
    } finally {
      setRemovingTeamId(null);
    }
  }

  function onSeedInputChange(teamId: string, value: string) {
    setSeedInputs((prev) => ({
      ...prev,
      [teamId]: value,
    }));
  }

  async function handleUpdateSeed(teamId: string) {
    if (!stageId) return;
    const val = seedInputs[teamId] ?? '';
    const seed = val.trim() === '' ? null : Number(val);

    setUpdatingSeedId(teamId);
    setErrorMsg(null);

    try {
      await adminFetchJson(`/api/admin/stages/${stageId}/teams`, {
        method: 'PATCH',
        body: JSON.stringify({
          teamId,
          seed,
        }),
      });
      addToast(t.toastSeedUpdated, 'info');
      fetchStageTeams();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errSeedUpdate);
    } finally {
      setUpdatingSeedId(null);
    }
  }

  // --- Bulk seed : sauvegarder tous les seeds d'un coup ---
  async function handleBulkSeedSave() {
    if (!stageId) return;

    const seeds = stageTeams.map((st) => {
      const val = seedInputs[st.team_id] ?? '';
      return {
        teamId: st.team_id,
        seed: val.trim() === '' ? null : Number(val),
      };
    });

    setBulkSeedSaving(true);
    setErrorMsg(null);

    try {
      const json = await adminFetchJson<{
        results?: { success?: boolean }[];
      }>(`/api/admin/stages/${stageId}/teams`, {
        method: 'PATCH',
        body: JSON.stringify({ seeds }),
      });
      const successCount = json.results?.filter((r) => r.success).length ?? 0;
      addToast(
        format(successCount > 1 ? t.toastBulkSeed_other : t.toastBulkSeed_one, {
          count: successCount,
        }),
        'info'
      );
      fetchStageTeams();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errBulkSeed);
    } finally {
      setBulkSeedSaving(false);
    }
  }

  // --- Auto-seed : numéroter 1, 2, 3… dans l'ordre actuel ---
  function handleAutoSeed() {
    const newInputs: Record<string, string> = {};
    stageTeams.forEach((st, i) => {
      newInputs[st.team_id] = String(i + 1);
    });
    setSeedInputs(newInputs);
  }

  // --- Sélection bulk ---
  function toggleTeamSelection(teamId: string) {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedTeamIds.size === stageTeams.length) {
      setSelectedTeamIds(new Set());
    } else {
      setSelectedTeamIds(new Set(stageTeams.map((st) => st.team_id)));
    }
  }

  async function handleBulkRemoveTeams() {
    if (!stageId || selectedTeamIds.size === 0) return;

    const count = selectedTeamIds.size;
    const ok = await confirm({
      title: format(
        count > 1 ? t.confirmBulkRemove_other : t.confirmBulkRemove_one,
        { count }
      ),
      variant: 'danger',
    });
    if (!ok) {
      return;
    }

    setBulkRemoving(true);
    setErrorMsg(null);

    try {
      await adminFetchJson(`/api/admin/stages/${stageId}/teams`, {
        method: 'DELETE',
        body: JSON.stringify({ teamIds: Array.from(selectedTeamIds) }),
      });
      addToast(
        format(count > 1 ? t.toastBulkRemoved_other : t.toastBulkRemoved_one, {
          count,
        }),
        'info'
      );
      setSelectedTeamIds(new Set());
      fetchStageTeams();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errBulkRemove);
    } finally {
      setBulkRemoving(false);
    }
  }

  const backUrl = stage?.tournament_id
    ? `/admin/tournament/${stage.tournament_id}`
    : '/admin/tournaments';

  return (
    <>
      {dialog}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <StageTabsNav
          stageId={String(stageId ?? '')}
          active="teams"
          stageType={stage?.stage_type}
          tournamentId={stage?.tournament_id ?? tournament?.id}
          tournamentName={tournament?.name}
        />
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t.heading}</h1>
            <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
          </div>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}
        {loading && <div className="text-neutral-300">{t.loadingTeams}</div>}

        {!loading && stage && (
          <div className="space-y-6">
            {/* Contexte stage / tournoi */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs text-neutral-400 mb-1">
                  {t.phaseLabel}
                </div>
                <div className="font-semibold">{stage.name}</div>
                {tournament && (
                  <div className="text-xs text-neutral-400 mt-1">
                    {t.tournamentPrefix}{' '}
                    <Link
                      href={backUrl}
                      className="underline underline-offset-2 hover:text-white"
                    >
                      {tournament.name}
                    </Link>
                    {tournament.slug && (
                      <>
                        {' '}
                        <span className="font-mono bg-neutral-900 border border-neutral-700 px-1.5 py-0.5 rounded">
                          {tournament.slug}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="text-sm text-neutral-300">
                <span className="text-neutral-400">{t.teamsInPhaseLabel}</span>{' '}
                <span className="font-semibold">{stageTeams.length}</span>
              </div>
            </section>

            {/* Formulaire d'ajout */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-3">{t.addTeamTitle}</h2>

              <form
                onSubmit={handleAddTeam}
                className="flex flex-wrap gap-4 items-end"
              >
                <div className="flex flex-col min-w-[220px]">
                  <label className="text-xs text-neutral-400 mb-1">
                    {t.teamSelectLabel}
                  </label>
                  <select
                    className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={addTeamId}
                    onChange={(e) => setAddTeamId(e.target.value)}
                    disabled={adding || loadingTeams || !tournament}
                  >
                    <option value="">
                      {loadingTeams ? t.loadingShort : t.selectTeam}
                    </option>
                    {availableTeamsForAdd.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}{' '}
                        {team.short_name ? `(${team.short_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col w-24">
                  <label className="text-xs text-neutral-400 mb-1">
                    {t.seedOptionalLabel}
                  </label>
                  <input
                    type="number"
                    className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={addSeed}
                    onChange={(e) => setAddSeed(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={adding}
                  className={`px-4 py-2 rounded font-semibold text-sm ${
                    adding
                      ? 'bg-blue-800 cursor-wait'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {adding ? t.adding : t.addTeamSubmit}
                </button>
              </form>

              {availableTeamsForAdd.length === 0 &&
                !loadingTeams &&
                tournamentTeams.length > 0 && (
                  <p className="mt-2 text-xs text-neutral-400">
                    {t.allTeamsAttached}
                  </p>
                )}
            </section>

            {/* Tableau des équipes de la phase */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-700 flex flex-wrap justify-between items-center gap-3">
                <h2 className="text-sm font-semibold">
                  {t.attachedTeamsTitle}
                  <span className="ml-2 text-xs text-neutral-400 font-normal">
                    {format(
                      stageTeams.length > 1
                        ? t.teamCount_other
                        : t.teamCount_one,
                      { count: stageTeams.length }
                    )}
                  </span>
                </h2>

                {stageTeams.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleAutoSeed}
                      className="px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 border border-neutral-600"
                      title={t.autoSeedTitle}
                    >
                      {t.autoSeed}
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkSeedSave}
                      disabled={bulkSeedSaving}
                      className={`px-3 py-1.5 text-xs rounded font-semibold ${
                        bulkSeedSaving
                          ? 'bg-blue-800 cursor-wait'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {bulkSeedSaving ? t.bulkSeedSaving : t.bulkSeedSave}
                    </button>

                    {selectedTeamIds.size > 0 && (
                      <button
                        type="button"
                        onClick={handleBulkRemoveTeams}
                        disabled={bulkRemoving}
                        className={`px-3 py-1.5 text-xs rounded font-semibold ${
                          bulkRemoving
                            ? 'bg-red-900 cursor-wait'
                            : 'bg-red-700 hover:bg-red-800'
                        }`}
                      >
                        {bulkRemoving
                          ? t.bulkRemoving
                          : format(
                              selectedTeamIds.size > 1
                                ? t.bulkRemove_other
                                : t.bulkRemove_one,
                              { count: selectedTeamIds.size }
                            )}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {stageTeams.length === 0 ? (
                <div className="px-4 py-6 text-sm text-neutral-400">
                  {t.emptyTeams}
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-750 text-neutral-300">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-center w-10">
                        <input
                          type="checkbox"
                          checked={
                            selectedTeamIds.size === stageTeams.length &&
                            stageTeams.length > 0
                          }
                          onChange={toggleSelectAll}
                          className="accent-blue-500"
                        />
                      </th>
                      <th scope="col" className="px-4 py-2 text-left">{t.thSeed}</th>
                      <th scope="col" className="px-4 py-2 text-left">{t.thTeam}</th>
                      <th scope="col" className="px-4 py-2 text-left">{t.thNotes}</th>
                      <th scope="col" className="px-4 py-2 text-right">{t.thActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageTeams.map((st) => (
                      <tr
                        key={st.team_id}
                        className={`border-t border-neutral-700 ${
                          selectedTeamIds.has(st.team_id)
                            ? 'bg-blue-900/20'
                            : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-2 align-middle text-center">
                          <input
                            type="checkbox"
                            checked={selectedTeamIds.has(st.team_id)}
                            onChange={() => toggleTeamSelection(st.team_id)}
                            className="accent-blue-500"
                          />
                        </td>

                        {/* Seed editable */}
                        <td className="px-4 py-2 align-middle">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              className="w-16 px-2 py-1 rounded bg-neutral-700 border border-neutral-600 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={seedInputs[st.team_id] ?? ''}
                              onChange={(e) =>
                                onSeedInputChange(st.team_id, e.target.value)
                              }
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateSeed(st.team_id)}
                              disabled={updatingSeedId === st.team_id}
                              className={`text-xs px-2 py-1 rounded ${
                                updatingSeedId === st.team_id
                                  ? 'bg-blue-800 cursor-wait'
                                  : 'bg-blue-600 hover:bg-blue-700'
                              }`}
                            >
                              {updatingSeedId === st.team_id
                                ? t.seedOkSaving
                                : t.seedOk}
                            </button>
                          </div>
                        </td>

                        {/* Team info */}
                        <td className="px-4 py-2 align-middle">
                          <div className="flex items-center gap-3">
                            {st.team?.logo_url && (
                              <Image
                                src={st.team.logo_url}
                                alt={st.team.name}
                                width={32}
                                height={32}
                                className="w-8 h-8 rounded object-cover border border-neutral-700"
                              />
                            )}
                            <div>
                              <div className="font-semibold">
                                {st.team ? st.team.name : st.team_id}
                              </div>
                              {st.team?.short_name && (
                                <div className="text-xs text-neutral-400">
                                  {st.team.short_name}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Notes (read-only pour l'instant) */}
                        <td className="px-4 py-2 align-middle text-xs text-neutral-300">
                          {st.notes || '—'}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-2 align-middle text-right">
                          <div className="flex justify-end gap-2">
                            {st.team && (
                              <Link
                                href={`/admin/teams/${st.team.id}`}
                                className="px-2 py-1 text-xs rounded bg-neutral-700 hover:bg-neutral-600"
                              >
                                {t.viewTeam}
                              </Link>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveTeam(st.team_id)}
                              disabled={removingTeamId === st.team_id}
                              className={`px-2 py-1 text-xs rounded ${
                                removingTeamId === st.team_id
                                  ? 'bg-red-900 cursor-wait'
                                  : 'bg-red-700 hover:bg-red-800'
                              }`}
                            >
                              {removingTeamId === st.team_id
                                ? t.removing
                                : t.remove}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </section>
          </div>
        )}

        {!loading && !stage && !errorMsg && (
          <div className="text-neutral-300">{t.stageNotFound}</div>
        )}
      </div>
    </>
  );
}

export default AdminStageTeamsPage;
