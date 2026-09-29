import { useEffect, useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import { useAdminFetch } from '@/hooks/useAdminFetch';
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
import type { StaffProps, TeamRow, TeamMemberRow } from '@/types/admin';
import {
  EMPTY_LOGO_CREDIT,
  logoCreditDraftFromRow,
  logoCreditPayload,
} from '@/components/admin/teams/TeamLogoCreditFields';
import type {
  TournamentRow,
  TournamentRegistration,
} from '@/types/adminTeamEdit';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';
import TeamRosterLockPanel from '@/components/admin/teams/TeamRosterLockPanel';
import TeamHistoryPanel from '@/components/admin/teams/TeamHistoryPanel';
import TeamQuickLinks from '@/components/admin/teams/TeamQuickLinks';
import type { TeamLocaleValue } from '@/components/admin/teams/TeamCommsFields';
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

const FORM_ID = 'team-edit-form';

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
  const router = useRouter();
  const { teamId } = router.query as { teamId?: string };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { mutate: addMemberMutate } = useIdempotentMutation();
  const { mutate: registerTournamentMutate } = useIdempotentMutation();

  const [team, setTeam] = useState<TeamRow | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [registeredTournaments, setRegisteredTournaments] = useState<
    TournamentRegistration[]
  >([]);
  const [availableTournaments, setAvailableTournaments] = useState<
    TournamentRow[]
  >([]);
  /** Effectif JOUANT (coachs/managers exclus), renvoyé par le GET. */
  const [playingCount, setPlayingCount] = useState(0);
  /**
   * Erreur de la section Tournois, rendue DANS la section.
   *
   * `errorMsg` s'affiche en tête d'une page de 1400 lignes : depuis le bloc
   * Tournois, tout en bas, un refus serveur était strictement invisible — d'où
   * « le formulaire ne fait rien ».
   */
  const [tournamentError, setTournamentError] = useState<string | null>(null);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');

  // Form state
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoCredit, setLogoCredit] = useState(EMPTY_LOGO_CREDIT);
  const [bannerUrl, setBannerUrl] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [twitter, setTwitter] = useState('');
  const [discord, setDiscord] = useState('');
  const [discordRoleId, setDiscordRoleId] = useState('');
  const [preferredLocale, setPreferredLocale] = useState<TeamLocaleValue>('');
  const [website, setWebsite] = useState('');
  const [isActive, setIsActive] = useState(true);
  // SR d'ensemble déclaré : saisi en chaîne (champ de formulaire), '' = effacer
  // la déclaration et rendre la main à la moyenne des fiches.
  const [skillRating, setSkillRating] = useState('');

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

  const fetchTeam = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const json = await adminFetchJson<{ team: TeamRow }>(
        `/api/admin/teams/${teamId}`
      );

      const row: TeamRow = json.team;
      setTeam(row);
      setName(row.name || '');
      setShortName(row.short_name || '');
      setLogoUrl(row.logo_url || '');
      setLogoCredit(logoCreditDraftFromRow(row));
      setBannerUrl(row.banner_url || '');
      setCountry(row.country || '');
      setDescription(row.description || '');
      setTwitter(row.twitter || '');
      setDiscord(row.discord || '');
      setDiscordRoleId(row.discord_role_id || '');
      setPreferredLocale((row.preferred_locale as TeamLocaleValue) || '');
      setWebsite(row.website || '');
      setSkillRating(row.skill_rating != null ? String(row.skill_rating) : '');
      setIsActive(row.is_active !== false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setLoading(false);
    }
  }, [teamId, adminFetchJson, t]);

  const fetchMembers = useCallback(async () => {
    if (!teamId) return;
    setMembersLoading(true);
    try {
      const res = await adminFetch(`/api/admin/teams/${teamId}/members`);
      const json = await res.json();
      if (res.ok && !json.error) {
        setMembers(json.members || []);
      }
    } catch {
      // Silently fail
    } finally {
      setMembersLoading(false);
    }
  }, [teamId, adminFetch]);

  const fetchTournaments = useCallback(async () => {
    if (!teamId) return;
    setTournamentsLoading(true);
    try {
      const res = await adminFetch(`/api/admin/teams/${teamId}/tournaments`);
      const json = await res.json();
      if (res.ok && !json.error) {
        setRegisteredTournaments(json.registered || []);
        setAvailableTournaments(json.available || []);
        setPlayingCount(Number(json.playerCount) || 0);
      }
    } catch {
      // Silently fail
    } finally {
      setTournamentsLoading(false);
    }
  }, [teamId, adminFetch]);

  useEffect(() => {
    if (!teamId) return;
    fetchTeam();
    fetchMembers();
    fetchTournaments();
    // adminFetch/adminFetchJson et t sont désormais stables : les fetchers ne
    // varient que via teamId → un seul chargement par teamId, sans vagues parasites.
  }, [teamId, fetchTeam, fetchMembers, fetchTournaments]);

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
      const payload: Partial<TeamRow> = {
        name,
        short_name: shortName || null,
        logo_url: logoUrl || null,
        ...logoCreditPayload(logoCredit),
        banner_url: bannerUrl || null,
        country: country || null,
        description: description || null,
        twitter: twitter || null,
        discord: discord || null,
        discord_role_id: discordRoleId.trim() || null,
        preferred_locale: preferredLocale || null,
        website: website || null,
        is_active: isActive,
        // Chaîne vide = effacer, pas « ne rien changer » : c'est la seule façon
        // de retirer une déclaration devenue fausse depuis l'écran staff.
        // Converti ici plutôt qu'envoyé en chaîne — l'API revalide de son côté.
        skill_rating: skillRating.trim() ? Number(skillRating.trim()) : null,
      };

      const json = await adminFetchJson<{ team: TeamRow }>(
        `/api/admin/teams/${teamId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );

      addToast(t.toastTeamUpdated, 'success');
      setTeam(json.team);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setSaving(false);
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

    setTournamentsLoading(true);

    try {
      const res = await registerTournamentMutate(
        `/api/admin/teams/${teamId}/tournaments`,
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
      setTournamentsLoading(false);
    }
  }

  async function handleUnregisterFromTournament(tournamentId: string) {
    if (!teamId) return;
    const ok = await confirm({
      title: t.confirmUnregister,
      variant: 'danger',
    });
    if (!ok) return;

    setTournamentsLoading(true);
    setTournamentError(null);
    try {
      const res = await adminFetch(`/api/admin/teams/${teamId}/tournaments`, {
        method: 'DELETE',
        body: JSON.stringify({ tournamentId }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || json.error) {
        throw new Error(json.error || t.errUnexpected);
      }

      await fetchTournaments();
      addToast(t.toastUnregistered, 'success');
    } catch (err: unknown) {
      // Auparavant avalé en silence : une désinscription qui échouait laissait
      // la ligne à l'écran et personne ne savait pourquoi.
      const msg = (err as Error)?.message ?? t.errUnexpected;
      setTournamentError(msg);
      addToast(msg, 'error');
    } finally {
      setTournamentsLoading(false);
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
    adminFetch,
    adminFetchJson,
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
    adminFetchJson,
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
    adminFetchJson,
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
          errorMsg={errorMsg}
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

        {team && (
          <FicheLayout
            main={
              <>
                <TeamEditInfoForm
                  formId={FORM_ID}
                  onSubmit={handleSubmit}
                  values={{
                    name,
                    shortName,
                    logoCredit,
                    bannerUrl,
                    country,
                    description,
                    twitter,
                    discord,
                    discordRoleId,
                    preferredLocale,
                    website,
                    isActive,
                    skillRating,
                  }}
                  setters={{
                    setName,
                    setShortName,
                    setLogoCredit,
                    setBannerUrl,
                    setCountry,
                    setDescription,
                    setTwitter,
                    setDiscord,
                    setDiscordRoleId,
                    setPreferredLocale,
                    setWebsite,
                    setIsActive,
                    setSkillRating,
                  }}
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

export default AdminEditTeamPage;
