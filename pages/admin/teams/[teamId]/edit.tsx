import { useEffect, useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import LogoUpload from '@/components/admin/LogoUpload';
import MembersSection from '@/components/admin/teams/MembersSection';
import AddMemberModal from '@/components/admin/teams/AddMemberModal';
import EditMemberModal from '@/components/admin/teams/EditMemberModal';
import ImportBattleTagsModal from '@/components/admin/teams/ImportBattleTagsModal';
import type {
  MemberFormState,
  SearchResult,
  ImportLine,
} from '@/components/admin/teams/types';
import { supabaseAdmin } from '@/utils/supabase';
import {
  loadTeamRolesFromSupabase,
  DEFAULT_TEAM_ROLES,
  type TeamRole,
} from '@/utils/teamRoles';
import type { StaffProps, TeamMemberRow, TeamRow } from '@/types/admin';
import type {
  TournamentRow,
  TournamentRegistration,
} from '@/types/adminTeamEdit';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';
import TeamRosterLockPanel from '@/components/admin/teams/TeamRosterLockPanel';
import TeamHistoryPanel from '@/components/admin/teams/TeamHistoryPanel';
import TeamQuickLinks from '@/components/admin/teams/TeamQuickLinks';
import { FicheLayout } from '@/features/admin/_shared/ui/Fiche';
import TeamEditHeader, {
  TEAM_EDIT_GHOST_SM,
  TeamEditSystemCards,
} from '@/features/admin/teams/ui/TeamEditHeader';
import TeamEditInfoForm from '@/features/admin/teams/ui/TeamEditInfoForm';
import TeamEditTournamentsSection from '@/features/admin/teams/ui/TeamEditTournamentsSection';
import { useTeamEditMemberActions } from '@/features/admin/teams/hooks/useTeamEditMemberActions';
import { useTeamEditRosterBulk } from '@/features/admin/teams/hooks/useTeamEditRosterBulk';
import { useTeamEditModals } from '@/features/admin/teams/hooks/useTeamEditModals';
import {
  teamPayloadFromForm,
  useTeamEditForm,
} from '@/features/admin/teams/hooks/useTeamEditForm';
import {
  useTeamCache,
  useTeamForEdit,
  useTeamMembers,
  useTeamTournaments,
} from '@/features/admin/teams/hooks/useTeamsQueries';
import { teamsClient, teamsPaths } from '@/features/admin/teams/client';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useUnsavedChangesGuard } from '@/hooks/forms/useUnsavedChangesGuard';
import { useOptimisticLock } from '@/features/admin/_shared/lock/useOptimisticLock';
import StaleUpdateNotice from '@/features/admin/_shared/lock/StaleUpdateNotice';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';

const FORM_ID = 'team-edit-form';

// Tableaux vides STABLES : les hooks de roster mémorisent sur `members`.
const EMPTY_MEMBERS: TeamMemberRow[] = [];
const EMPTY_REGISTERED: TournamentRegistration[] = [];
const EMPTY_AVAILABLE: TournamentRow[] = [];

export const getServerSideProps = withStaffPage<{ teamRoles: TeamRole[] }>(
  { permission: 'manage_teams' },
  async () => {
    const teamRoles = supabaseAdmin
      ? await loadTeamRolesFromSupabase(supabaseAdmin)
      : DEFAULT_TEAM_ROLES;
    return { teamRoles };
  }
);

function AdminEditTeamPage({
  teamRoles,
}: StaffProps & { teamRoles: TeamRole[] }) {
  const t = useAdminT(nsAdminTeamEdit);
  const tFiche = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { teamId } = router.query as { teamId?: string };

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { mutate: addMemberMutate } = useIdempotentMutation();
  const { mutate: registerTournamentMutate } = useIdempotentMutation();

  // Lectures en cache partagé (lot L10) : la fiche, la liste et le panneau de
  // disponibilités lisent les mêmes clés ; chaque écriture ci-dessous les
  // invalide, la liste /admin/teams comprise.
  const teamQuery = useTeamForEdit(teamId);
  const membersQuery = useTeamMembers(teamId);
  const tournamentsQuery = useTeamTournaments(teamId);
  const {
    setTeam,
    refetchTeam: fetchTeam,
    refetchMembers: fetchMembers,
    refetchTournaments: fetchTournaments,
  } = useTeamCache(teamId);

  const team = teamQuery.data?.team ?? null;
  const loading = teamQuery.isFetching;
  const members = membersQuery.data ?? EMPTY_MEMBERS;
  const membersLoading = membersQuery.isFetching;
  const registeredTournaments =
    tournamentsQuery.data?.registered ?? EMPTY_REGISTERED;
  const availableTournaments =
    tournamentsQuery.data?.available ?? EMPTY_AVAILABLE;
  /** Effectif JOUANT (coachs/managers exclus), renvoyé par le GET. */
  const playingCount = Number(tournamentsQuery.data?.playerCount) || 0;
  const teamLoadError = teamQuery.error
    ? (teamQuery.error.message ?? t.errUnexpected)
    : null;

  /**
   * Erreur de la section Tournois, rendue DANS la section.
   *
   * `errorMsg` s'affiche en tête d'une page de 1400 lignes : depuis le bloc
   * Tournois, tout en bas, un refus serveur était strictement invisible — d'où
   * « le formulaire ne fait rien ».
   */
  const [tournamentError, setTournamentError] = useState<string | null>(null);
  const [tournamentsBusy, setTournamentsBusy] = useState(false);
  const tournamentsLoading = tournamentsBusy || tournamentsQuery.isFetching;
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');

  // Formulaire « infos » : un objet, hydraté une fois par fiche.
  const { form, setters, dirty, markSaved, hydrate, version } = useTeamEditForm(
    teamId,
    team
  );
  // Verrou optimiste : la version vient du formulaire (useTeamEditForm).
  const lock = useOptimisticLock();
  useUnsavedChangesGuard(dirty, tFiche.unsavedConfirm);
  const { logoUrl, ...infoFormValues } = form;
  const { setLogoUrl, ...infoFormSetters } = setters;

  // Member modals
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberRow | null>(
    null
  );
  const [memberForm, setMemberForm] = useState<MemberFormState>({
    email: '',
    userId: '',
    role: 'player',
    battleTag: '',
    specialty: '',
    skillRating: '',
    setCaptain: false,
    isSubstitute: false,
    addMode: 'invite',
    reason: '',
  });
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  // Swap state
  const [swapSource, setSwapSource] = useState<TeamMemberRow | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // CSV / paste import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<ImportLine[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Player search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  // Debounce + annulation de la recherche joueur (voir handleSearchPlayers).
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Nettoie le timer de debounce + toute recherche en vol au démontage.
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (searchAbortRef.current) searchAbortRef.current.abort();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId) return;
    setSaving(true);
    setErrorMsg(null);

    try {
      const json = await teamsClient.update(teamId, {
        ...teamPayloadFromForm(form),
        // Verrou optimiste : 409 si l'équipe a changé depuis l'ouverture.
        expected_updated_at: version,
      } as Partial<TeamRow>);

      markSaved(json.team);
      addToast(t.toastTeamUpdated, 'success');
      // Fiche à jour + listes invalidées : /admin/teams montre la ligne
      // modifiée sans rechargement.
      setTeam(json.team);
    } catch (err: unknown) {
      if (!lock.catchStale(err))
        setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setSaving(false);
    }
  }

  // 409 : relire l'équipe et repartir de la version à jour.
  async function handleReload() {
    if (!teamId) return;
    try {
      await lock.reload(async () => {
        const json = await teamsClient.get(teamId);
        if (json.team) {
          setTeam(json.team);
          hydrate(json.team);
        }
        setErrorMsg(null);
      });
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    }
  }

  async function handleRegisterToTournament() {
    if (!teamId || !selectedTournamentId) return;
    setTournamentError(null);

    // `min_players` ne refuse plus côté serveur : c'est ici que le staff est
    // prévenu qu'il inscrit une équipe incomplète, et qu'il le confirme. Sans
    // cette étape, l'assouplissement deviendrait une inscription accidentelle.
    const target = availableTournaments.find(
      (tourn) => tourn.id === selectedTournamentId
    );
    const minPlayers = Number(target?.min_players) || 0;
    if (minPlayers > 0 && playingCount < minPlayers) {
      const ok = await confirm({
        title: format(t.confirmIncompleteRoster, {
          count: playingCount,
          min: minPlayers,
        }),
        subtitle: t.confirmIncompleteRosterDesc,
      });
      if (!ok) return;
    }

    setTournamentsBusy(true);

    try {
      const res = await registerTournamentMutate(
        teamsPaths.tournaments(teamId),
        {
          method: 'POST',
          body: JSON.stringify({ tournamentId: selectedTournamentId }),
        }
      );

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || t.errRegister);
      }

      setSelectedTournamentId('');
      await fetchTournaments();
      addToast(t.toastRegistered, 'success');
    } catch (err: unknown) {
      // Dans la section ET en toast : le bandeau de tête reste hors de vue.
      const msg = (err as Error)?.message ?? t.errUnexpected;
      setTournamentError(msg);
      addToast(msg, 'error');
    } finally {
      setTournamentsBusy(false);
    }
  }

  async function handleUnregisterFromTournament(tournamentId: string) {
    if (!teamId) return;
    const ok = await confirm({
      title: t.confirmUnregister,
      variant: 'danger',
    });
    if (!ok) return;

    setTournamentsBusy(true);
    setTournamentError(null);
    try {
      await teamsClient.unregisterTournament(teamId, tournamentId);

      await fetchTournaments();
      addToast(t.toastUnregistered, 'success');
    } catch (err: unknown) {
      // Auparavant avalé en silence : une désinscription qui échouait laissait
      // la ligne à l'écran et personne ne savait pourquoi.
      const msg = (err as Error)?.message ?? t.errUnexpected;
      setTournamentError(msg);
      addToast(msg, 'error');
    } finally {
      setTournamentsBusy(false);
    }
  }

  // Écart au roster requis du tournoi SÉLECTIONNÉ dans le menu déroulant.
  // Sert à l'avertissement sous le sélecteur ET à la confirmation au clic.
  const selectedMinPlayers =
    Number(
      availableTournaments.find((tourn) => tourn.id === selectedTournamentId)
        ?.min_players
    ) || 0;
  const selectedRosterGap =
    selectedMinPlayers > 0 ? Math.max(0, selectedMinPlayers - playingCount) : 0;

  // Actions de membre (modales, recherche joueur, capitanat, échange) :
  // features/admin/teams/hooks/useTeamEditMemberActions.ts.
  const {
    openAddMemberModal,
    handleSearchPlayers,
    selectPlayer,
    openEditMemberModal,
    handleAddMember,
    handleEditMember,
    handleDeleteMember,
    handleSetCaptain,
    handleStartSwap,
    handleCancelSwap,
    handleSwapWithSource,
  } = useTeamEditMemberActions({
    t,
    teamId,
    memberForm,
    editingMember,
    swapSource,
    addMemberMutate,
    addToast,
    confirm,
    fetchMembers,
    fetchTeam,
    searchDebounceRef,
    searchAbortRef,
    setMemberForm,
    setMemberError,
    setMemberSaving,
    setSearchQuery,
    setSearchResults,
    setSearchLoading,
    setShowSearchResults,
    setShowAddMemberModal,
    setShowEditMemberModal,
    setEditingMember,
    setTeam,
    setErrorMsg,
    setSwapSource,
  });

  // Deep-link : `?add-member=1` (ancienne route /admin/teams/add-member, et
  // liens « Ajouter un membre » de la fiche équipe) ouvre la modale d'ajout.
  const addMemberDeepLinkRef = useRef(false);
  useEffect(() => {
    if (!router.isReady || addMemberDeepLinkRef.current) return;
    if (router.query['add-member']) {
      addMemberDeepLinkRef.current = true;
      openAddMemberModal();
      const { 'add-member': _omit, ...rest } = router.query;
      void router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true }
      );
    }
  }, [router.isReady, router.query, router, openAddMemberModal]);

  // Sélection multiple + actions groupées :
  // features/admin/teams/hooks/useTeamEditRosterBulk.ts.
  const {
    captainUserId,
    selectionHasCaptain,
    rosterMembers,
    subMembers,
    staffMembers,
    handleBulkRemove,
    handleSelectAll,
    handleBulkSetRole,
    handleBulkSetSubstitute,
  } = useTeamEditRosterBulk({
    t,
    teamId,
    team,
    members,
    selectedIds,
    setSelectedIds,
    bulkRole,
    setBulkRole,
    setBulkBusy,
    setErrorMsg,
    addToast,
    confirm,
    clearSelection,
    fetchMembers,
    fetchTeam,
  });

  // Import de BattleTags + ouverture / fermeture des modales :
  // features/admin/teams/hooks/useTeamEditModals.ts.
  const {
    buildImportPreview,
    applyImport,
    openImportModal,
    closeImportModal,
    handleImportTextChange,
    closeAddMemberModal,
    closeEditMemberModal,
  } = useTeamEditModals({
    t,
    teamId,
    members,
    importText,
    setImportText,
    importPreview,
    setImportPreview,
    setImportBusy,
    setShowImportModal,
    setShowAddMemberModal,
    setShowEditMemberModal,
    setEditingMember,
    setErrorMsg,
    addToast,
    fetchMembers,
  });

  return (
    <>
      {dialog}
      <Head>
        <title>
          {team?.name
            ? format(t.headTitleWithName, { name: team.name })
            : t.headTitle}
        </title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <TeamEditHeader
          team={team}
          teamId={teamId}
          formId={FORM_ID}
          saving={saving}
          loading={loading}
          errorMsg={errorMsg ?? teamLoadError}
          onBack={() => router.push('/admin/teams')}
          historySlot={
            team && (
              // Lot A6 : l'historique se lit SUR la fiche, sans quitter l'écran.
              <EntityHistoryButton
                entityType="team"
                entityId={team.id}
                className={TEAM_EDIT_GHOST_SM}
              />
            )
          }
        />

        {lock.stale && (
          <StaleUpdateNotice
            onReload={handleReload}
            reloading={lock.reloading}
          />
        )}

        {team && (
          <FicheLayout
            main={
              <>
                <TeamEditInfoForm
                  formId={FORM_ID}
                  onSubmit={handleSubmit}
                  values={infoFormValues}
                  setters={infoFormSetters}
                  logoSlot={
                    <LogoUpload
                      value={logoUrl}
                      onChange={setLogoUrl}
                      label={t.logoLabel}
                    />
                  }
                />

                <MembersSection
                  membersCount={members.length}
                  membersLoading={membersLoading}
                  rosterMembers={rosterMembers}
                  subMembers={subMembers}
                  staffMembers={staffMembers}
                  teamRoles={teamRoles}
                  captainUserId={captainUserId}
                  swapSource={swapSource}
                  selectedIds={selectedIds}
                  selectionHasCaptain={selectionHasCaptain}
                  bulkRole={bulkRole}
                  bulkBusy={bulkBusy}
                  onCancelSwap={handleCancelSwap}
                  onOpenImport={openImportModal}
                  onOpenAddMember={openAddMemberModal}
                  onSelectAll={handleSelectAll}
                  onBulkRoleChange={setBulkRole}
                  onBulkSetRole={handleBulkSetRole}
                  onBulkSetSubstitute={handleBulkSetSubstitute}
                  onBulkRemove={handleBulkRemove}
                  onClearSelection={clearSelection}
                  onToggleSelected={toggleSelected}
                  onStartSwap={handleStartSwap}
                  onSwapWithSource={handleSwapWithSource}
                  onSetCaptain={handleSetCaptain}
                  onEditMember={openEditMemberModal}
                  onDeleteMember={handleDeleteMember}
                />

                <TeamEditTournamentsSection
                  loading={tournamentsLoading}
                  error={tournamentError}
                  registered={registeredTournaments}
                  available={availableTournaments}
                  playingCount={playingCount}
                  selectedTournamentId={selectedTournamentId}
                  onSelectTournament={setSelectedTournamentId}
                  onRegister={handleRegisterToTournament}
                  onUnregister={handleUnregisterFromTournament}
                  selectedRosterGap={selectedRosterGap}
                  selectedMinPlayers={selectedMinPlayers}
                />

                <TeamRosterLockPanel teamId={String(teamId ?? '')} />
              </>
            }
            aside={
              <>
                <TeamEditSystemCards team={team} />

                <TeamQuickLinks
                  teamId={team.id}
                  slug={team.slug ?? null}
                  captainUserId={captainUserId}
                />

                <TeamHistoryPanel teamId={team.id} />
              </>
            }
          />
        )}
      </div>

      <AddMemberModal
        open={showAddMemberModal}
        onClose={closeAddMemberModal}
        teamRoles={teamRoles}
        memberForm={memberForm}
        setMemberForm={setMemberForm}
        memberSaving={memberSaving}
        memberError={memberError}
        searchQuery={searchQuery}
        searchResults={searchResults}
        searchLoading={searchLoading}
        showSearchResults={showSearchResults}
        onSearchChange={handleSearchPlayers}
        onSelectPlayer={selectPlayer}
        onSubmit={handleAddMember}
      />

      <EditMemberModal
        open={Boolean(showEditMemberModal && editingMember)}
        onClose={closeEditMemberModal}
        editingMember={editingMember}
        teamRoles={teamRoles}
        memberForm={memberForm}
        setMemberForm={setMemberForm}
        memberSaving={memberSaving}
        memberError={memberError}
        onSubmit={handleEditMember}
      />

      <ImportBattleTagsModal
        open={showImportModal}
        onClose={closeImportModal}
        importText={importText}
        importPreview={importPreview}
        importBusy={importBusy}
        onImportTextChange={handleImportTextChange}
        onBuildPreview={buildImportPreview}
        onApply={applyImport}
      />
    </>
  );
}

export default withAdminQuery(AdminEditTeamPage);
