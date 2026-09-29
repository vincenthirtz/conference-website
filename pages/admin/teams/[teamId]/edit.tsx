import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
import { BATTLE_TAG_REGEX, isNonPlayingTeamRole } from '@/utils/teams/roleKind';
import {
  addMemberSuccessToast,
  buildAddMemberBody,
  validateAddMemberForm,
} from '@/components/admin/teams/staffAddMember';
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

const BATTLE_TAG_RE = BATTLE_TAG_REGEX;
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

  // Member handlers
  const openAddMemberModal = useCallback(() => {
    setMemberForm({
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
    setMemberError(null);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    setShowAddMemberModal(true);
  }, []);

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

  // La recherche joueur tape une API coûteuse (listUsers + jointures + N
  // getUserById). On débounce la frappe et on annule la requête précédente pour
  // ne lancer qu'un fetch par pause de saisie, et ignorer les réponses périmées.
  const runSearch = useCallback(async (query: string) => {
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);
    setShowSearchResults(true);
    try {
      const res = await fetch(
        `/api/admin/users/search?q=${encodeURIComponent(query)}`,
        { signal: controller.signal }
      );
      const json = await res.json();
      if (res.ok && json.players) {
        setSearchResults(json.players);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setSearchResults([]);
    } finally {
      // Ne relâche le spinner que si c'est toujours la requête active.
      if (searchAbortRef.current === controller) setSearchLoading(false);
    }
  }, []);

  const handleSearchPlayers = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        if (searchAbortRef.current) searchAbortRef.current.abort();
        setSearchResults([]);
        setShowSearchResults(false);
        setSearchLoading(false);
        return;
      }
      // Feedback immédiat pendant l'attente du debounce.
      setShowSearchResults(true);
      setSearchLoading(true);
      searchDebounceRef.current = setTimeout(() => runSearch(trimmed), 300);
    },
    [runSearch]
  );

  const selectPlayer = useCallback((player: SearchResult) => {
    setMemberForm((prev) => ({
      ...prev,
      email: player.email || '',
      userId: player.id,
      battleTag: player.battle_tag || '',
    }));
    setShowSearchResults(false);
    setSearchQuery(
      player.email || player.battle_tag || player.display_name || ''
    );
  }, []);

  const openEditMemberModal = useCallback((member: TeamMemberRow) => {
    setEditingMember(member);
    setMemberForm({
      email: '',
      userId: member.user_id,
      role: member.role,
      battleTag: member.battle_tag || '',
      specialty: member.specialty || '',
      skillRating:
        member.skill_rating != null ? String(member.skill_rating) : '',
      setCaptain: false,
      isSubstitute: member.is_substitute ?? false,
      addMode: 'invite',
      reason: '',
    });
    setMemberError(null);
    setShowEditMemberModal(true);
  }, []);

  const handleAddMember = useCallback(async () => {
    if (!teamId) return;
    const invalid = validateAddMemberForm(memberForm, t);
    if (invalid) {
      setMemberError(invalid);
      return;
    }
    setMemberSaving(true);
    setMemberError(null);
    try {
      const res = await addMemberMutate(`/api/admin/teams/${teamId}/members`, {
        method: 'POST',
        body: buildAddMemberBody(memberForm),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || t.errAddMember);
      }
      setShowAddMemberModal(false);
      addToast(...addMemberSuccessToast(json, t));
      await fetchMembers();
    } catch (err: unknown) {
      setMemberError((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setMemberSaving(false);
    }
  }, [teamId, memberForm, addMemberMutate, addToast, fetchMembers, t]);

  const handleEditMember = useCallback(async () => {
    if (!teamId || !editingMember) return;

    setMemberSaving(true);
    setMemberError(null);

    try {
      await adminFetchJson(`/api/admin/teams/${teamId}/members`, {
        method: 'PATCH',
        body: JSON.stringify({
          memberId: editingMember.id,
          role: memberForm.role.trim() || 'player',
          battleTag: memberForm.battleTag.trim() || null,
          // Chaîne vide = effacer le poste (validateSpecialty la rend null).
          specialty: memberForm.specialty,
          // Champ vide = effacer, pas « ne rien changer » : c'est la seule
          // façon de retirer un SR devenu faux depuis l'écran staff.
          skillRating: memberForm.skillRating.trim() || null,
          isSubstitute: memberForm.isSubstitute,
        }),
      });

      setShowEditMemberModal(false);
      setEditingMember(null);
      addToast(t.toastMemberEdited, 'success');
      await fetchMembers();
    } catch (err: unknown) {
      setMemberError((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setMemberSaving(false);
    }
  }, [
    teamId,
    editingMember,
    memberForm,
    adminFetchJson,
    addToast,
    fetchMembers,
    t,
  ]);

  const handleDeleteMember = useCallback(
    async (member: TeamMemberRow) => {
      if (!teamId) return;
      const ok = await confirm({
        title: format(t.confirmDeleteMember, {
          member: member.battle_tag || member.user_id,
        }),
        variant: 'danger',
      });
      if (!ok) return;

      try {
        const res = await adminFetch(`/api/admin/teams/${teamId}/members`, {
          method: 'DELETE',
          body: JSON.stringify({ memberId: member.id }),
        });

        if (res.ok) {
          addToast(t.toastMemberRemoved, 'success');
          await fetchMembers();
          await fetchTeam();
        }
      } catch {
        // Silently fail
      }
    },
    [teamId, adminFetch, addToast, fetchMembers, fetchTeam, confirm, t]
  );

  const handleSetCaptain = useCallback(
    async (member: TeamMemberRow) => {
      if (!teamId) return;
      const ok = await confirm({
        title: format(t.confirmSetCaptain, {
          member: member.battle_tag || member.user_id,
        }),
        variant: 'warning',
      });
      if (!ok) return;

      try {
        const json = await adminFetchJson<{ team: TeamRow }>(
          `/api/admin/teams/${teamId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ captain_id: member.user_id }),
          }
        );

        setTeam(json.team);
        addToast(t.toastCaptainSet, 'success');
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message ?? t.errUnexpected);
      }
    },
    [teamId, adminFetchJson, addToast, confirm, t]
  );

  const handleSwap = useCallback(
    async (memberA: TeamMemberRow, memberB: TeamMemberRow) => {
      if (!teamId) return;

      try {
        await adminFetchJson(`/api/admin/teams/${teamId}/members`, {
          method: 'PATCH',
          body: JSON.stringify({
            memberId: memberA.id,
            swapWithMemberId: memberB.id,
          }),
        });

        setSwapSource(null);
        addToast(t.toastSwapDone, 'success');
        await fetchMembers();
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message ?? t.errUnexpected);
      }
    },
    [teamId, adminFetchJson, addToast, fetchMembers, t]
  );

  // Amorce d'un échange depuis une ligne (bouton "Échanger").
  const handleStartSwap = useCallback((member: TeamMemberRow) => {
    setSwapSource(member);
  }, []);

  const handleCancelSwap = useCallback(() => setSwapSource(null), []);

  // Cible d'échange cliquée : échange avec la source courante.
  const handleSwapWithSource = useCallback(
    (member: TeamMemberRow) => {
      if (swapSource) handleSwap(swapSource, member);
    },
    [swapSource, handleSwap]
  );

  // --- Bulk actions -------------------------------------------------------
  const captainUserId = team?.captain_id ?? null;
  // Mémoïsés : sinon ces filtres O(n) tournaient à chaque frappe (re-render).
  const selectedMembers = useMemo(
    () => members.filter((m) => selectedIds.has(m.id)),
    [members, selectedIds]
  );
  const selectionHasCaptain = useMemo(
    () =>
      selectedMembers.some(
        (m) => captainUserId !== null && m.user_id === captainUserId
      ),
    [selectedMembers, captainUserId]
  );
  // Roster / remplaçantes / encadrement — mémoïsés pour la section Membres.
  //
  // Coach et manager ne sont pas des joueuses : les afficher dans le roster
  // gonflait l'effectif visible et les rendait échangeables avec une
  // remplaçante. Même définition que la règle BattleTag côté API
  // (`isNonPlayingTeamRole`), pour que les deux ne divergent pas.
  const { rosterMembers, subMembers, staffMembers } = useMemo(() => {
    const staff = members.filter((m) => isNonPlayingTeamRole(m.role));
    const playing = members.filter((m) => !isNonPlayingTeamRole(m.role));
    return {
      rosterMembers: playing.filter((m) => !m.is_substitute),
      subMembers: playing.filter((m) => m.is_substitute),
      staffMembers: staff,
    };
  }, [members]);

  const runBulk = useCallback(
    async (
      operation: 'set_role' | 'set_substitute' | 'remove',
      extra: Record<string, unknown> = {}
    ) => {
      if (!teamId || selectedIds.size === 0) return;
      setBulkBusy(true);
      setErrorMsg(null);
      try {
        const json = await adminFetchJson<{
          successCount?: number;
          failureCount?: number;
        }>(`/api/admin/teams/${teamId}/roster-bulk`, {
          method: 'POST',
          body: JSON.stringify({
            operation,
            memberIds: Array.from(selectedIds),
            ...extra,
          }),
        });
        const { successCount = 0, failureCount = 0 } = json;
        addToast(
          failureCount > 0
            ? format(t.bulkPartial, {
                success: successCount,
                failure: failureCount,
              })
            : format(t.bulkSuccess, { success: successCount }),
          failureCount > 0 ? 'info' : 'success'
        );
        clearSelection();
        setBulkRole('');
        await fetchMembers();
        await fetchTeam();
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message ?? t.errUnexpected);
      } finally {
        setBulkBusy(false);
      }
    },
    [
      teamId,
      selectedIds,
      adminFetchJson,
      addToast,
      clearSelection,
      fetchMembers,
      fetchTeam,
      t,
    ]
  );

  const handleBulkRemove = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: format(t.confirmBulkRemove, { count: selectedIds.size }),
      variant: 'danger',
    });
    if (!ok) return;
    await runBulk('remove');
  }, [selectedIds, runBulk, confirm, t]);

  // Handlers bulk stables passés à MembersSection.
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) setSelectedIds(new Set(members.map((m) => m.id)));
      else clearSelection();
    },
    [members, clearSelection]
  );

  const handleBulkSetRole = useCallback(
    () => runBulk('set_role', { role: bulkRole }),
    [runBulk, bulkRole]
  );

  const handleBulkSetSubstitute = useCallback(
    (isSubstitute: boolean) => runBulk('set_substitute', { isSubstitute }),
    [runBulk]
  );

  // --- BattleTag import ---------------------------------------------------
  const buildImportPreview = useCallback(() => {
    const lines = importText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const preview: ImportLine[] = lines.map((raw) => {
      const parts = raw.split(',').map((p) => p.trim());
      const key = parts[0] ?? '';
      const tag = parts[1] ?? '';
      if (!key || !tag) {
        return { raw, key, tag, status: 'empty' };
      }
      if (!BATTLE_TAG_RE.test(tag)) {
        return { raw, key, tag, status: 'invalid' };
      }
      const keyLower = key.toLowerCase();
      const match = members.find(
        (m) =>
          m.id === key ||
          m.user_id === key ||
          (m.battle_tag && m.battle_tag.toLowerCase() === keyLower)
      );
      if (!match) {
        return { raw, key, tag, status: 'not-found' };
      }
      return {
        raw,
        key,
        tag,
        status: 'matched',
        memberId: match.id,
        memberLabel: match.battle_tag || match.user_id,
      };
    });
    setImportPreview(preview);
  }, [importText, members]);

  const applyImport = useCallback(async () => {
    if (!teamId || !importPreview) return;
    const items = importPreview
      .filter((l) => l.status === 'matched' && l.memberId)
      .map((l) => ({ memberId: l.memberId as string, battleTag: l.tag }));
    if (items.length === 0) {
      setErrorMsg(t.errNoValidImport);
      return;
    }
    setImportBusy(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<{
        successCount?: number;
        failureCount?: number;
      }>(`/api/admin/teams/${teamId}/roster-bulk`, {
        method: 'POST',
        body: JSON.stringify({ operation: 'import_battle_tags', items }),
      });
      const { successCount = 0, failureCount = 0 } = json;
      addToast(
        failureCount > 0
          ? format(t.importPartial, {
              success: successCount,
              failure: failureCount,
            })
          : format(t.importSuccess, { success: successCount }),
        failureCount > 0 ? 'info' : 'success'
      );
      setShowImportModal(false);
      setImportText('');
      setImportPreview(null);
      await fetchMembers();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setImportBusy(false);
    }
  }, [teamId, importPreview, adminFetchJson, addToast, fetchMembers, t]);

  // Ouverture / fermeture des modales (handlers stables pour les React.memo).
  const openImportModal = useCallback(() => {
    setImportText('');
    setImportPreview(null);
    setShowImportModal(true);
  }, []);

  const closeImportModal = useCallback(() => setShowImportModal(false), []);

  const handleImportTextChange = useCallback((value: string) => {
    setImportText(value);
    setImportPreview(null);
  }, []);

  const closeAddMemberModal = useCallback(
    () => setShowAddMemberModal(false),
    []
  );

  const closeEditMemberModal = useCallback(() => {
    setShowEditMemberModal(false);
    setEditingMember(null);
  }, []);

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
