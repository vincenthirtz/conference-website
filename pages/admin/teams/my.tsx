import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { splitTeamMembers } from '@/utils/teams/roleKind';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { withSubjectParam } from '@/utils/subjectParam';
import { MemberRosterRow } from '@/components/admin/teams/my/MemberRosterRow';
import type { Member, SearchResult } from '@/components/admin/teams/my/types';

import { logger } from '../../../utils/logger';
import { addMemberFeedbackToasts } from '@/components/admin/teams/myAddMemberFeedback';
import nsAdminTeamsMy from '@/lib/i18n/locales/admin-fr/adminTeamsMy';
import { withTeamParam } from '@/utils/teamScopeParam';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import { useMyTeamMemberActions } from '@/features/admin/teams/hooks/useMyTeamMemberActions';
import MyTeamHeader, {
  MyTeamSelector,
  MyTeamStatus,
} from '@/features/admin/teams/ui/MyTeamHeader';
import MyTeamInfoForm from '@/features/admin/teams/ui/MyTeamInfoForm';
import MyTeamMembersSection from '@/features/admin/teams/ui/MyTeamMembersSection';
import MyTeamJoinRequests, {
  type MyTeamJoinRequest,
} from '@/features/admin/teams/ui/MyTeamJoinRequests';
import MyTeamAddMemberModal from '@/features/admin/teams/ui/MyTeamAddMemberModal';
type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  bio: string | null;
  country?: string | null;
  description?: string | null;
  /** Sujet emprunté par le staff pour les routes scopées capitaine (act-as). */
  captain_id?: string | null;
};

type TeamOption = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type ApiResponse = {
  team: TeamLite | null;
  members: Member[];
  isCaptain: boolean;
  isManager?: boolean;
  error?: string;
};

export const getServerSideProps = withStaffPage('caster');

function MyTeamPage({ staff }: StaffProps) {
  const t = useAdminT(nsAdminTeamsMy);
  const router = useRouter();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const isStaffAdmin =
    staff.role === 'admin' ||
    staff.role === 'owner' ||
    staff.role === 'manager';

  // Team selection for admins
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [loadingAllTeams, setLoadingAllTeams] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

  // Équipe active (sélecteur partagé) : un manager multi-équipes ouvre ce
  // cockpit sur celle qu'il a choisie, pas sur la première venue.
  const { withTeam } = useActiveTeam();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Les routes `/api/teams/*` sont scopées CAPITAINE : elles résolvent l'équipe
  // depuis `getManagedTeam(appelant)`. Quand le staff pilote ici une AUTRE
  // équipe que la sienne, il n'a pas ce scope — d'où des 403
  // TEAM_MANAGEMENT_FORBIDDEN. On ne contourne pas le gate : on lui donne le
  // bon sujet via `?as=<capitaine>` (S1) — il continue de tourner, sur elle,
  // et le staff n'obtient jamais plus de droits qu'elle. Les écritures ajoutent
  // `&act=1` (S4, routes qui déclarent `allowActAs`).
  // Null hors de ce cas : `withSubjectParam` est alors un no-op et le chemin
  // capitaine reste identique à avant.
  const actAsCaptainId =
    isStaffAdmin && selectedTeamId ? (data?.team?.captain_id ?? null) : null;

  // Les routes `/api/teams/*` résolvent l'équipe depuis les droits de
  // l'appelant. Un manager peut en encadrer plusieurs : on leur nomme donc
  // explicitement l'équipe AFFICHÉE ici, pour qu'une action ne parte jamais
  // sur une autre que celle qu'on a sous les yeux. Sans équipe chargée (ou
  // pour les routes `/api/admin/*`, qui portent déjà leur id), c'est un no-op.
  const scopeToTeam = useCallback(
    (url: string) => withTeamParam(url, data?.team?.id ?? null),
    [data?.team?.id]
  );
  /** Équipe pilotée par le staff mais SANS capitaine : aucun sujet à emprunter. */
  const captainScopeUnavailable =
    isStaffAdmin && !!selectedTeamId && !!data?.team && !actAsCaptainId;

  const [form, setForm] = useState({
    name: '',
    short_name: '',
    bio: '',
    logo_url: '',
    country: '',
    description: '',
  });

  // Joinable toggle
  const [isJoinable, setIsJoinable] = useState(false);
  const [togglingJoinable, setTogglingJoinable] = useState(false);

  // Join requests
  type JoinRequest = MyTeamJoinRequest;
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinRequestsLoading, setJoinRequestsLoading] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(
    null
  );

  // Search and add member state
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  // Debounce + annulation de la recherche joueur : sans AbortController, une
  // reponse lente d'une requete anterieure peut ecraser un resultat plus recent
  // (reponses hors-ordre). Meme pattern que pages/admin/teams/[teamId]/edit.tsx.
  const searchAbortRef = useRef<AbortController | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<SearchResult | null>(
    null
  );
  const [newMemberRole, setNewMemberRole] = useState('player');
  const [newMemberBattleTag, setNewMemberBattleTag] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // Load all teams for admin selector
  const loadAllTeams = useCallback(async () => {
    if (!isStaffAdmin) return;
    setLoadingAllTeams(true);
    try {
      const res = await adminFetch('/api/admin/teams?limit=500&includeTotal=0');
      if (res.ok) {
        const json = await res.json();
        setAllTeams(json.teams || []);
      }
    } catch (err) {
      logger.error('Failed to load teams list', err);
    } finally {
      setLoadingAllTeams(false);
    }
  }, [isStaffAdmin, adminFetch]);

  useEffect(() => {
    loadAllTeams();
  }, [loadAllTeams]);

  const load = useCallback(
    async (teamId?: string) => {
      setLoading(true);
      setError(null);
      try {
        // If admin and a specific team is selected, fetch that team
        let url = withTeam('/api/admin/teams/my');
        if (isStaffAdmin && teamId) {
          // withMembers=1 : ce chemin lit json.members de la réponse détail
          // (les autres consommateurs rechargent via /members et l'omettent).
          url = `/api/admin/teams/${teamId}?withMembers=1`;
        }

        const json = await adminFetchJson<any>(url);

        // Handle different API response formats
        if (isStaffAdmin && teamId && json.team) {
          // Admin team fetch returns { team, members }
          setData({
            team: json.team,
            members: json.members || [],
            isCaptain: true, // Admin has full access
            isManager: false,
          });
          setForm({
            name: json.team.name || '',
            short_name: json.team.short_name || '',
            bio: json.team.bio || '',
            logo_url: json.team.logo_url || '',
            country: json.team.country || '',
            description: json.team.description || '',
          });
        } else {
          setData(json);
          if (json.team) {
            setForm({
              name: json.team.name || '',
              short_name: json.team.short_name || '',
              bio: json.team.bio || '',
              logo_url: json.team.logo_url || '',
              country: json.team.country || '',
              description: json.team.description || '',
            });
          }
        }
      } catch (err: unknown) {
        setError((err as Error)?.message || t.errLoad);
      } finally {
        setLoading(false);
      }
    },
    [isStaffAdmin, adminFetchJson, t, withTeam]
  );

  useEffect(() => {
    // If admin has selected a team, load that team
    if (isStaffAdmin && selectedTeamId) {
      load(selectedTeamId);
    } else if (!isStaffAdmin) {
      // For non-admin (captain), load their own team
      load();
    }
  }, [load, isStaffAdmin, selectedTeamId]);

  const updateField = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!data?.team) return;
    setSaving(true);
    try {
      // Use admin endpoint for staff, captain endpoint for captains
      const url = isStaffAdmin
        ? `/api/admin/teams/${data.team.id}`
        : '/api/admin/teams/my';

      await adminFetchJson(url, {
        method: 'PATCH',
        body: JSON.stringify({
          teamId: data.team.id,
          ...form,
        }),
      });

      // Reload
      if (isStaffAdmin && selectedTeamId) {
        await load(selectedTeamId);
      } else {
        await load();
      }
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errSave, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Search players
  const handleSearchPlayers = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        return;
      }
      // Annule la requete precedente encore en vol pour eviter les reponses
      // hors-ordre (une reponse perimee ecrasant un resultat plus recent).
      if (searchAbortRef.current) searchAbortRef.current.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchLoading(true);
      try {
        const json = await adminFetchJson<{ players?: SearchResult[] }>(
          scopeToTeam(
            withSubjectParam(
              `/api/teams/search-players?q=${encodeURIComponent(query)}`,
              actAsCaptainId
            )
          ),
          { signal: controller.signal }
        );
        // Ignore les reponses d'une requete qui a ete supplantee entre-temps.
        if (searchAbortRef.current !== controller) return;
        setSearchResults(json.players || []);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        logger.error('Search error:', err);
        if (searchAbortRef.current === controller) setSearchResults([]);
      } finally {
        // Ne relache le spinner que si c'est toujours la requete active.
        if (searchAbortRef.current === controller) setSearchLoading(false);
      }
    },
    [adminFetchJson, actAsCaptainId, scopeToTeam]
  );

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        handleSearchPlayers(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearchPlayers]);

  // Annule toute recherche en vol au démontage.
  useEffect(() => {
    return () => {
      if (searchAbortRef.current) searchAbortRef.current.abort();
    };
  }, []);

  // Add member to team
  const handleAddMember = async () => {
    if (!selectedPlayer || !data?.team) return;
    setAddingMember(true);
    try {
      // Use admin endpoint for staff
      const url = isStaffAdmin
        ? '/api/admin/teams/add-member'
        : '/api/teams/add-member';

      const res = await adminFetch(scopeToTeam(url), {
        method: 'POST',
        body: JSON.stringify({
          teamId: data.team.id,
          userId: selectedPlayer.id,
          role: newMemberRole,
          battleTag: newMemberBattleTag || selectedPlayer.battle_tag,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json?.error || t.errAdd, 'error');
        return;
      }
      for (const [message, kind] of addMemberFeedbackToasts(json, t)) {
        addToast(message, kind);
      }
      // Reset and reload
      setShowAddModal(false);
      setSelectedPlayer(null);
      setSearchQuery('');
      setSearchResults([]);
      setNewMemberRole('player');
      setNewMemberBattleTag('');

      if (isStaffAdmin && selectedTeamId) {
        await load(selectedTeamId);
      } else {
        await load();
      }
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errAdd, 'error');
    } finally {
      setAddingMember(false);
    }
  };

  // Load join requests for the team
  const loadJoinRequests = useCallback(async () => {
    // Sans capitaine à emprunter, l'appel ne peut que 403 : on n'essaie pas.
    if (captainScopeUnavailable) {
      setJoinRequests([]);
      return;
    }
    setJoinRequestsLoading(true);
    try {
      const json = await adminFetchJson<{ demandes?: JoinRequest[] }>(
        withSubjectParam(
          scopeToTeam('/api/teams/join-requests?status=pending'),
          actAsCaptainId
        )
      );
      setJoinRequests(json.demandes || []);
    } catch (err) {
      logger.error('Failed to load join requests', err);
    } finally {
      setJoinRequestsLoading(false);
    }
  }, [adminFetchJson, actAsCaptainId, captainScopeUnavailable, scopeToTeam]);

  // Toggle joinable status
  const handleToggleJoinable = async () => {
    setTogglingJoinable(true);
    try {
      const res = await adminFetch(
        scopeToTeam(
          withSubjectParam('/api/teams/toggle-joinable', actAsCaptainId, true)
        ),
        {
          method: 'POST',
          body: JSON.stringify({ joinable: !isJoinable }),
        }
      );
      const json = await res.json();
      if (res.ok) {
        setIsJoinable(json.is_joinable);
      } else {
        addToast(json?.error || t.errGeneric, 'error');
      }
    } catch (err) {
      logger.error('Toggle joinable error:', err);
    } finally {
      setTogglingJoinable(false);
    }
  };

  // BattleTags saisis a la volee pour les demandes qui n'en portent pas : sans
  // eux l'approbation creerait une fiche de roster vide (cf.
  // utils/teams/demandeBattleTag.ts).
  const [joinBattleTags, setJoinBattleTags] = useState<Record<string, string>>(
    {}
  );

  // Handle approve/reject join request
  const handleJoinRequestAction = async (
    demandeId: string,
    action: 'approve' | 'reject'
  ) => {
    setProcessingRequestId(demandeId);
    try {
      const res = await adminFetch(
        scopeToTeam(
          withSubjectParam('/api/teams/join-requests', actAsCaptainId, true)
        ),
        {
          method: 'POST',
          body: JSON.stringify({
            demandeId,
            action,
            battleTag: joinBattleTags[demandeId]?.trim() || undefined,
          }),
        }
      );
      const json = await res.json();
      if (res.ok) {
        // Remove from list and reload members
        setJoinRequests((prev) => prev.filter((r) => r.id !== demandeId));
        if (action === 'approve') {
          if (isStaffAdmin && selectedTeamId) {
            await load(selectedTeamId);
          } else {
            await load();
          }
        }
      } else {
        addToast(json?.error || t.errGeneric, 'error');
      }
    } catch (err) {
      logger.error('Join request action error:', err);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const reloadTeam = useCallback(() => {
    if (isStaffAdmin && selectedTeamId) {
      return load(selectedTeamId);
    }
    return load();
  }, [isStaffAdmin, selectedTeamId, load]);

  const {
    editingBattleTagId,
    battleTagDraft,
    setBattleTagDraft,
    memberActionId,
    swapSourceId,
    skillRatingDrafts,
    startEditBattleTag,
    cancelEditBattleTag,
    startSwap,
    cancelSwap,
    handleSkillRatingDraftChange,
    saveBattleTag,
    saveSkillRating,
    toggleSubstitute,
    handleSwapWith,
    handleTransferCaptain,
  } = useMyTeamMemberActions({
    isStaffAdmin,
    selectedTeamId,
    members: data?.members,
    adminFetch,
    addToast,
    confirm,
    t,
    reloadTeam,
    scopeToTeam,
  });

  const handleSelectPlayer = useCallback((player: SearchResult) => {
    setSelectedPlayer(player);
    if (player.battle_tag) {
      setNewMemberBattleTag(player.battle_tag);
    }
  }, []);

  // Load join requests when team data changes
  const teamId = data?.team?.id;
  const isCaptain = data?.isCaptain;
  const isManager = data?.isManager;
  useEffect(() => {
    if (teamId && (isCaptain || isManager || isStaffAdmin)) {
      loadJoinRequests();
    }
  }, [teamId, isCaptain, isManager, isStaffAdmin, loadJoinRequests]);

  // Sync isJoinable state from team data
  useEffect(() => {
    if (data?.team) {
      const t = data.team as { is_joinable?: boolean | null };
      setIsJoinable(t.is_joinable ?? false);
    }
  }, [data?.team]);

  const canEdit = isStaffAdmin || data?.isCaptain || data?.isManager;

  // Valeurs dérivées mémoïsées : évitent de recalculer la liste et le décompte
  // de remplaçants à chaque frappe/tick (recherche joueur, formulaire, etc.).
  const members = useMemo(() => data?.members ?? [], [data?.members]);
  const membersCount = members.length;
  // Joueuses vs encadrement (coach / manager) : même prédicat partagé que
  // l'API et que /admin/teams/[id]/edit.
  const { playingMembers, staffMembers } = useMemo(() => {
    const { roster, subs, staff } = splitTeamMembers(members);
    return { playingMembers: [...roster, ...subs], staffMembers: staff };
  }, [members]);
  // Le décompte de remplaçantes ne porte que sur les joueuses : un membre
  // d'encadrement marqué remplaçant serait compté deux fois sinon.
  const subsCount = useMemo(
    () => playingMembers.filter((m) => m.is_substitute).length,
    [playingMembers]
  );

  const swapMode = swapSourceId !== null;
  const renderRow = (m: Member) => (
    <MemberRosterRow
      key={m.id}
      member={m}
      canEdit={!!canEdit}
      membersCount={membersCount}
      isEditingTag={editingBattleTagId === m.id}
      battleTagDraft={editingBattleTagId === m.id ? battleTagDraft : ''}
      busy={memberActionId === m.id}
      swapMode={swapMode}
      isSwapSource={swapSourceId === m.id}
      skillRatingDraft={skillRatingDrafts[m.id]}
      onStartEditBattleTag={startEditBattleTag}
      onBattleTagDraftChange={setBattleTagDraft}
      onSkillRatingDraftChange={handleSkillRatingDraftChange}
      onSaveSkillRating={saveSkillRating}
      onSaveBattleTag={saveBattleTag}
      onCancelEditBattleTag={cancelEditBattleTag}
      onToggleSubstitute={toggleSubstitute}
      onStartSwap={startSwap}
      onCancelSwap={cancelSwap}
      onSwapWith={handleSwapWith}
      onTransferCaptain={handleTransferCaptain}
    />
  );

  const closeAddModal = () => {
    setShowAddModal(false);
    setSelectedPlayer(null);
    setSearchQuery('');
    setSearchResults([]);
    setNewMemberBattleTag('');
    setNewMemberRole('player');
  };

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <MyTeamHeader
          team={data?.team ?? null}
          subtitle={
            isStaffAdmin
              ? t.subtitleAdmin
              : data?.isCaptain
                ? t.subtitleCaptain
                : data?.isManager
                  ? t.subtitleManager
                  : t.subtitleReadonly
          }
          onBack={() => router.push('/admin/teams')}
          onRefresh={() =>
            isStaffAdmin && selectedTeamId ? load(selectedTeamId) : load()
          }
        />

        {/* Admin Team Selector */}
        {isStaffAdmin && (
          <MyTeamSelector
            teams={allTeams}
            selectedTeamId={selectedTeamId}
            loadingTeams={loadingAllTeams}
            onSelect={setSelectedTeamId}
            onReset={() => {
              setSelectedTeamId('');
              setData(null);
              setForm({
                name: '',
                short_name: '',
                bio: '',
                logo_url: '',
                country: '',
                description: '',
              });
            }}
          />
        )}

        {/* Chargement, erreur, ou aucune équipe (admin sans sélection /
            capitaine sans équipe) */}
        <MyTeamStatus
          loading={loading}
          error={error}
          hasTeam={!!data?.team}
          isStaffAdmin={isStaffAdmin}
          onCreateTeam={() => router.push('/admin/teams/new')}
        />

        {/* Team content */}
        {!loading && !error && data?.team && (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <MyTeamInfoForm
              form={form}
              canEdit={!!canEdit}
              onFieldChange={updateField}
              isJoinable={isJoinable}
              togglingJoinable={togglingJoinable}
              captainScopeUnavailable={captainScopeUnavailable}
              onToggleJoinable={handleToggleJoinable}
              saving={saving}
              onSave={handleSave}
            />

            <MyTeamMembersSection
              canEdit={!!canEdit}
              membersCount={membersCount}
              subsCount={subsCount}
              playingMembers={playingMembers}
              staffMembers={staffMembers}
              onOpenAdd={() => setShowAddModal(true)}
              renderRow={renderRow}
            />

            {/* Join Requests */}
            {canEdit && (joinRequests.length > 0 || joinRequestsLoading) && (
              <div className="lg:col-span-2">
                <MyTeamJoinRequests
                  joinRequests={joinRequests}
                  loading={joinRequestsLoading}
                  processingRequestId={processingRequestId}
                  joinBattleTags={joinBattleTags}
                  onBattleTagChange={(demandeId, value) =>
                    setJoinBattleTags((prev) => ({
                      ...prev,
                      [demandeId]: value,
                    }))
                  }
                  onAction={handleJoinRequestAction}
                  onRefresh={loadJoinRequests}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {dialog}

      {/* Add Member Modal */}
      <MyTeamAddMemberModal
        open={showAddModal}
        onClose={closeAddModal}
        captainScopeUnavailable={captainScopeUnavailable}
        selectedPlayer={selectedPlayer}
        onSelectPlayer={handleSelectPlayer}
        onClearPlayer={() => setSelectedPlayer(null)}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchResults={searchResults}
        searchLoading={searchLoading}
        battleTag={newMemberBattleTag}
        onBattleTagChange={setNewMemberBattleTag}
        role={newMemberRole}
        onRoleChange={setNewMemberRole}
        adding={addingMember}
        onAdd={handleAddMember}
      />
    </>
  );
}

export default MyTeamPage;
