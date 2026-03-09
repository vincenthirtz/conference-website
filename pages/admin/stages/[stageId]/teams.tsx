import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';

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

export const getServerSideProps = withStaffPage('manager');

function AdminStageTeamsPage({ staff }: StaffProps) {
  const router = useRouter();
  const { stageId } = router.query;

  const [loading, setLoading] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

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
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [bulkRemoving, setBulkRemoving] = useState(false);

  useEffect(() => {
    if (!stageId) return;
    fetchStageTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId]);

  async function fetchStageTeams() {
    if (!stageId) return;
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/teams`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || 'Impossible de charger les équipes de la phase'
        );
      }
      const json: StageTeamsApiResponse = await res.json();
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
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  async function fetchTournamentTeams(tournamentId: string) {
    setLoadingTeams(true);
    try {
      const res = await fetch(`/api/admin/tournament/${tournamentId}/teams`);
      if (!res.ok) {
        throw new Error('Impossible de charger les équipes du tournoi');
      }
      const json: TournamentTeamsApiResponse = await res.json();
      setTournamentTeams(json.teams || []);
    } catch (err) {
      console.error('fetchTournamentTeams error', err);
    } finally {
      setLoadingTeams(false);
    }
  }

  const availableTeamsForAdd = useMemo(() => {
    const inStageIds = new Set(stageTeams.map((st) => st.team_id));
    return tournamentTeams.filter((t) => !inStageIds.has(t.id));
  }, [stageTeams, tournamentTeams]);

  async function handleAddTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!stageId) return;
    if (!addTeamId) {
      setErrorMsg('Merci de sélectionner une équipe à ajouter.');
      return;
    }

    setAdding(true);
    setErrorMsg(null);
    setInfoMsg(null);

    const seed = addSeed.trim() !== '' ? Number(addSeed) : null;

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId: addTeamId,
          seed,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de l'ajout de l'équipe");
      }

      await res.json();
      setInfoMsg('Équipe ajoutée à la phase.');
      setAddTeamId('');
      setAddSeed('');
      fetchStageTeams();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inattendue lors de l'ajout");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveTeam(teamId: string) {
    if (!stageId) return;
    setRemovingTeamId(teamId);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/teams`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teamId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors du retrait de l'équipe");
      }
      await res.json();
      setInfoMsg('Équipe retirée de la phase.');
      fetchStageTeams();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue lors du retrait');
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
    setInfoMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/teams`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          seed,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la mise à jour du seed');
      }
      await res.json();
      setInfoMsg('Seed mis à jour.');
      fetchStageTeams();
    } catch (err: any) {
      setErrorMsg(
        err?.message ?? 'Erreur inattendue lors de la mise à jour du seed'
      );
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
    setInfoMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/teams`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la mise à jour des seeds');
      }
      const json = await res.json();
      const successCount = json.results?.filter((r: any) => r.success).length ?? 0;
      setInfoMsg(`Seeds mis à jour pour ${successCount} équipe${successCount > 1 ? 's' : ''}.`);
      fetchStageTeams();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue lors du bulk seed');
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
    if (!confirm(`Retirer ${count} équipe${count > 1 ? 's' : ''} de cette phase ?`)) {
      return;
    }

    setBulkRemoving(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/teams`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamIds: Array.from(selectedTeamIds) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors du retrait en masse');
      }
      await res.json();
      setInfoMsg(`${count} équipe${count > 1 ? 's' : ''} retirée${count > 1 ? 's' : ''} de la phase.`);
      setSelectedTeamIds(new Set());
      fetchStageTeams();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue lors du retrait en masse');
    } finally {
      setBulkRemoving(false);
    }
  }

  const backUrl = stage?.tournament_id
    ? `/admin/tournament/${stage.tournament_id}`
    : '/admin/tournaments';

  return (
    <>
      <Head>
        <title>Admin – Équipes de la phase</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(`/admin/stages/${stageId}`)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour à la phase
            </button>
            <h1 className="text-3xl font-bold">Équipes de la phase</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Gère les équipes rattachées à cette phase (stage) : ajout,
              retrait, seeds…
            </p>
          </div>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="mb-4 rounded bg-emerald-900/60 border border-emerald-600 px-4 py-3 text-sm">
            {infoMsg}
          </div>
        )}

        {loading && (
          <div className="text-neutral-300">
            Chargement des équipes de la phase…
          </div>
        )}

        {!loading && stage && (
          <div className="space-y-6">
            {/* Contexte stage / tournoi */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs text-neutral-400 mb-1">Phase</div>
                <div className="font-semibold">{stage.name}</div>
                {tournament && (
                  <div className="text-xs text-neutral-400 mt-1">
                    Tournoi :{' '}
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
                <span className="text-neutral-400">
                  Équipes dans la phase :
                </span>{' '}
                <span className="font-semibold">{stageTeams.length}</span>
              </div>
            </section>

            {/* Formulaire d'ajout */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-3">
                Ajouter une équipe à cette phase
              </h2>

              <form
                onSubmit={handleAddTeam}
                className="flex flex-wrap gap-4 items-end"
              >
                <div className="flex flex-col min-w-[220px]">
                  <label className="text-xs text-neutral-400 mb-1">
                    Équipe (tournoi)
                  </label>
                  <select
                    className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={addTeamId}
                    onChange={(e) => setAddTeamId(e.target.value)}
                    disabled={adding || loadingTeams || !tournament}
                  >
                    <option value="">
                      {loadingTeams ? 'Chargement…' : 'Sélectionner une équipe'}
                    </option>
                    {availableTeamsForAdd.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.short_name ? `(${t.short_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col w-24">
                  <label className="text-xs text-neutral-400 mb-1">
                    Seed (optionnel)
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
                  {adding ? 'Ajout…' : "Ajouter l'équipe"}
                </button>
              </form>

              {availableTeamsForAdd.length === 0 &&
                !loadingTeams &&
                tournamentTeams.length > 0 && (
                  <p className="mt-2 text-xs text-neutral-400">
                    Toutes les équipes du tournoi sont déjà rattachées à cette
                    phase.
                  </p>
                )}
            </section>

            {/* Tableau des équipes de la phase */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-700 flex flex-wrap justify-between items-center gap-3">
                <h2 className="text-sm font-semibold">
                  Équipes rattachées à la phase
                  <span className="ml-2 text-xs text-neutral-400 font-normal">
                    {stageTeams.length} équipe
                    {stageTeams.length > 1 ? 's' : ''}
                  </span>
                </h2>

                {stageTeams.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleAutoSeed}
                      className="px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 border border-neutral-600"
                      title="Numéroter automatiquement 1, 2, 3… dans l'ordre actuel"
                    >
                      Auto-seed 1..N
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
                      {bulkSeedSaving
                        ? 'Sauvegarde…'
                        : 'Sauvegarder tous les seeds'}
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
                          ? 'Retrait…'
                          : `Retirer ${selectedTeamIds.size} équipe${selectedTeamIds.size > 1 ? 's' : ''}`}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {stageTeams.length === 0 ? (
                <div className="px-4 py-6 text-sm text-neutral-400">
                  Aucune équipe n&apos;est encore rattachée à cette phase.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-neutral-750 text-neutral-300">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">
                        <input
                          type="checkbox"
                          checked={selectedTeamIds.size === stageTeams.length && stageTeams.length > 0}
                          onChange={toggleSelectAll}
                          className="accent-blue-500"
                        />
                      </th>
                      <th className="px-4 py-2 text-left">Seed</th>
                      <th className="px-4 py-2 text-left">Équipe</th>
                      <th className="px-4 py-2 text-left">Notes</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageTeams.map((st) => (
                      <tr
                        key={st.team_id}
                        className={`border-t border-neutral-700 ${
                          selectedTeamIds.has(st.team_id) ? 'bg-blue-900/20' : ''
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
                              {updatingSeedId === st.team_id ? 'OK…' : 'OK'}
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
                                Voir équipe
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
                                ? 'Retrait…'
                                : 'Retirer'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}

        {!loading && !stage && !errorMsg && (
          <div className="text-neutral-300">Phase introuvable.</div>
        )}
      </div>
    </>
  );
}

export default AdminStageTeamsPage;
