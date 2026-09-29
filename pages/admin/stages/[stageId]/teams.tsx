import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import DataTable, {
  type BulkAction,
  type DataTableColumn,
} from '@/components/admin/DataTable';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import StageTabsNav from '@/components/admin/stages/StageTabsNav';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../../utils/logger';
import nsAdminStageTeams from '@/lib/i18n/locales/admin-fr/adminStageTeams';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const EYEBROW =
  'mb-1 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const LABEL = 'mb-1 text-xs text-[var(--t3,#a39ba6)]';
const INPUT =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';
const ERR_BOX =
  'rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]';
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

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminStageTeamsPage(_props: StaffProps) {
  const t = useAdminT(nsAdminStageTeams);
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

  // La sélection multiple (cocher une ligne, tout cocher) vit désormais dans
  // le kit — ces deux fonctions y étaient réécrites à la main.

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

  // Colonnes déclaratives (lot A5). La sélection multiple et l'action groupée
  // passent par le kit : la logique « tout cocher / décocher » et le bandeau de
  // sélection étaient réécrits ici à la main.
  const teamColumns: DataTableColumn<StageTeam>[] = [
    {
      key: 'seed',
      header: t.thSeed,
      value: (st) => st.seed ?? 0,
      render: (st) => (
        <span className="flex items-center gap-2">
          <input
            type="number"
            aria-label={t.thSeed}
            className={`${INPUT} w-16 px-2 py-1 font-mono text-xs`}
            value={seedInputs[st.team_id] ?? ''}
            onChange={(e) => onSeedInputChange(st.team_id, e.target.value)}
          />
          <AdminButton
            variant="ghost"
            size="xs"
            onClick={() => handleUpdateSeed(st.team_id)}
            disabled={updatingSeedId === st.team_id}
          >
            {updatingSeedId === st.team_id ? t.seedOkSaving : t.seedOk}
          </AdminButton>
        </span>
      ),
    },
    {
      key: 'team',
      header: t.thTeam,
      value: (st) => st.team?.name ?? st.team_id,
      render: (st) => (
        <span className="flex items-center gap-3">
          {st.team?.logo_url && (
            <Image
              src={st.team.logo_url}
              alt={st.team.name}
              width={32}
              height={32}
              className="h-8 w-8 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] object-cover"
            />
          )}
          <span>
            <span className="block font-semibold">
              {st.team ? st.team.name : st.team_id}
            </span>
            {st.team?.short_name && (
              <span className="block text-xs text-[var(--t3,#a39ba6)]">
                {st.team.short_name}
              </span>
            )}
          </span>
        </span>
      ),
    },
    {
      key: 'notes',
      header: t.thNotes,
      value: (st) => st.notes ?? '',
      className: 'text-xs text-[var(--t2,#c7bfca)]',
      render: (st) => <>{st.notes || '—'}</>,
    },
    {
      key: 'actions',
      header: t.thActions,
      sortable: false,
      headerClassName: 'text-right',
      className: 'text-right',
      render: (st) => (
        <span className="flex justify-end gap-2">
          {st.team && (
            <AdminButtonLink
              href={`/admin/teams/${st.team.id}`}
              variant="ghost"
              size="xs"
            >
              {t.viewTeam}
            </AdminButtonLink>
          )}
          <AdminButton
            variant="danger"
            size="xs"
            onClick={() => handleRemoveTeam(st.team_id)}
            disabled={removingTeamId === st.team_id}
          >
            {removingTeamId === st.team_id ? t.removing : t.remove}
          </AdminButton>
        </span>
      ),
    },
  ];

  const bulkActions: BulkAction<StageTeam>[] = [
    {
      // Le libellé porte le COMPTE (« Retirer 3 équipes ») : c'est ce qui
      // évite de cliquer sur une action groupée sans savoir sur quoi.
      label: bulkRemoving
        ? t.bulkRemoving
        : format(
            selectedTeamIds.size > 1 ? t.bulkRemove_other : t.bulkRemove_one,
            { count: selectedTeamIds.size }
          ),
      variant: 'danger',
      run: () => handleBulkRemoveTeams(),
    },
  ];

  return (
    <>
      {dialog}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <StageTabsNav
          stageId={String(stageId ?? '')}
          active="teams"
          stageType={stage?.stage_type}
          tournamentId={stage?.tournament_id ?? tournament?.id}
          tournamentName={tournament?.name}
        />
        <AdminPageHeader title={t.heading} subtitle={t.subtitle} />

        {errorMsg && <div className={`mb-4 ${ERR_BOX}`}>{errorMsg}</div>}
        {loading && (
          <div className={`${CARD} text-sm text-[var(--t3,#a39ba6)]`}>
            {t.loadingTeams}
          </div>
        )}

        {!loading && stage && (
          <div className="space-y-6">
            {/* Contexte stage / tournoi */}
            <section
              className={`${CARD} flex flex-wrap items-center justify-between gap-4`}
            >
              <div>
                <p className={EYEBROW}>{t.phaseLabel}</p>
                <div className="font-semibold text-[var(--t1,#f4edf7)]">
                  {stage.name}
                </div>
                {tournament && (
                  <div className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                    {t.tournamentPrefix}{' '}
                    <Link
                      href={backUrl}
                      className="underline underline-offset-2 hover:text-[var(--t1,#f4edf7)]"
                    >
                      {tournament.name}
                    </Link>
                    {tournament.slug && (
                      <>
                        {' '}
                        <span className="rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-1.5 py-0.5 font-mono">
                          {tournament.slug}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="text-sm text-[var(--t2,#c7bfca)]">
                <span className="text-[var(--t3,#a39ba6)]">
                  {t.teamsInPhaseLabel}
                </span>{' '}
                <span className="font-mono font-semibold text-[var(--t1,#f4edf7)]">
                  {stageTeams.length}
                </span>
              </div>
            </section>

            {/* Formulaire d'ajout */}
            <FicheSection title={t.addTeamTitle}>
              <form
                onSubmit={handleAddTeam}
                className="flex flex-wrap items-end gap-4"
              >
                <div className="flex min-w-[220px] flex-col">
                  <label className={LABEL}>{t.teamSelectLabel}</label>
                  <select
                    className={INPUT}
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

                <div className="flex w-24 flex-col">
                  <label className={LABEL}>{t.seedOptionalLabel}</label>
                  <input
                    type="number"
                    className={`${INPUT} font-mono`}
                    value={addSeed}
                    onChange={(e) => setAddSeed(e.target.value)}
                  />
                </div>

                <AdminButton type="submit" variant="primary" disabled={adding}>
                  {adding ? t.adding : t.addTeamSubmit}
                </AdminButton>
              </form>

              {availableTeamsForAdd.length === 0 &&
                !loadingTeams &&
                tournamentTeams.length > 0 && (
                  <p className="mt-2 text-xs text-[var(--t3,#a39ba6)]">
                    {t.allTeamsAttached}
                  </p>
                )}
            </FicheSection>

            {/* Tableau des équipes de la phase */}
            <section className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line2,rgba(194,196,201,.2))] px-4 py-3">
                <h2 className="text-[15px] text-[var(--t1,#f4edf7)]">
                  {t.attachedTeamsTitle}
                  <span className="ml-2 font-mono text-xs font-normal text-[var(--t3,#a39ba6)]">
                    {format(
                      stageTeams.length > 1
                        ? t.teamCount_other
                        : t.teamCount_one,
                      { count: stageTeams.length }
                    )}
                  </span>
                </h2>

                {stageTeams.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminButton
                      variant="ghost"
                      size="xs"
                      onClick={handleAutoSeed}
                      title={t.autoSeedTitle}
                    >
                      {t.autoSeed}
                    </AdminButton>
                    <AdminButton
                      variant="secondary"
                      size="xs"
                      onClick={handleBulkSeedSave}
                      disabled={bulkSeedSaving}
                    >
                      {bulkSeedSaving ? t.bulkSeedSaving : t.bulkSeedSave}
                    </AdminButton>

                    {selectedTeamIds.size > 0 && (
                      <AdminButton
                        variant="danger"
                        size="xs"
                        onClick={handleBulkRemoveTeams}
                        disabled={bulkRemoving}
                      >
                        {bulkRemoving
                          ? t.bulkRemoving
                          : format(
                              selectedTeamIds.size > 1
                                ? t.bulkRemove_other
                                : t.bulkRemove_one,
                              { count: selectedTeamIds.size }
                            )}
                      </AdminButton>
                    )}
                  </div>
                )}
              </div>

              <DataTable<StageTeam>
                rows={stageTeams}
                columns={teamColumns}
                rowKey={(st) => st.team_id}
                rowClassName={(st) =>
                  selectedTeamIds.has(st.team_id)
                    ? 'bg-[rgba(180,103,209,.08)]'
                    : ''
                }
                loading={false}
                error={null}
                emptyTitle={t.emptyTeams}
                exportFilename="phase-equipes"
                selection={{
                  actions: bulkActions,
                  selected: selectedTeamIds,
                  onChange: setSelectedTeamIds,
                }}
              />
            </section>
          </div>
        )}

        {!loading && !stage && !errorMsg && (
          <div className={`${CARD} text-sm text-[var(--t3,#a39ba6)]`}>
            {t.stageNotFound}
          </div>
        )}
      </div>
    </>
  );
}

export default AdminStageTeamsPage;
