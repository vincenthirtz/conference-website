import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import Breadcrumb from '@/components/admin/Breadcrumb';
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
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type TournamentRow = {
  id: string;
  name: string;
  slug: string;
  game: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  max_teams?: number | null;
};

type TournamentRegistration = TournamentRow & {
  stages: Array<{
    stageId: string;
    stageName: string;
    stageType: string;
  }>;
};

const BATTLE_TAG_RE = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;

export const getServerSideProps = withStaffPage<{ teamRoles: TeamRole[] }>(
  'admin',
  async () => {
    const teamRoles = supabaseAdmin
      ? await loadTeamRolesFromSupabase(supabaseAdmin)
      : DEFAULT_TEAM_ROLES;
    return { teamRoles };
  }
);

function AdminEditTeamPage({
  staff,
  teamRoles,
}: StaffProps & { teamRoles: TeamRole[] }) {
  const t = useAdminT('adminTeamEdit');
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
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');

  // Form state
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [twitter, setTwitter] = useState('');
  const [discord, setDiscord] = useState('');
  const [discordRoleId, setDiscordRoleId] = useState('');
  const [website, setWebsite] = useState('');
  const [isActive, setIsActive] = useState(true);

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
    setCaptain: false,
    isSubstitute: false,
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
      setBannerUrl(row.banner_url || '');
      setCountry(row.country || '');
      setDescription(row.description || '');
      setTwitter(row.twitter || '');
      setDiscord(row.discord || '');
      setDiscordRoleId(row.discord_role_id || '');
      setWebsite(row.website || '');
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
        banner_url: bannerUrl || null,
        country: country || null,
        description: description || null,
        twitter: twitter || null,
        discord: discord || null,
        discord_role_id: discordRoleId.trim() || null,
        website: website || null,
        is_active: isActive,
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
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
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
    try {
      const res = await adminFetch(`/api/admin/teams/${teamId}/tournaments`, {
        method: 'DELETE',
        body: JSON.stringify({ tournamentId }),
      });

      if (res.ok) {
        await fetchTournaments();
      }
    } catch {
      // Silently fail
    } finally {
      setTournamentsLoading(false);
    }
  }

  // Member handlers
  const openAddMemberModal = useCallback(() => {
    setMemberForm({
      email: '',
      userId: '',
      role: 'player',
      battleTag: '',
      setCaptain: false,
      isSubstitute: false,
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
      setCaptain: false,
      isSubstitute: member.is_substitute ?? false,
    });
    setMemberError(null);
    setShowEditMemberModal(true);
  }, []);

  const handleAddMember = useCallback(async () => {
    if (!teamId) return;
    if (!memberForm.email.trim() && !memberForm.userId.trim()) {
      setMemberError(t.errEmailOrUserId);
      return;
    }
    if (!memberForm.battleTag.trim()) {
      setMemberError(t.errBattleTagRequired);
      return;
    }

    setMemberSaving(true);
    setMemberError(null);

    try {
      const res = await addMemberMutate(`/api/admin/teams/${teamId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          email: memberForm.email.trim() || undefined,
          userId: memberForm.userId.trim() || undefined,
          role: memberForm.role.trim() || 'player',
          battleTag: memberForm.battleTag.trim() || undefined,
          setCaptain: memberForm.setCaptain,
          isSubstitute: memberForm.isSubstitute,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || t.errAddMember);
      }

      setShowAddMemberModal(false);
      addToast(t.toastMemberAdded, 'success');
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
  // Roster / remplaçants — mémoïsés pour la section Membres (cf. rendu plus bas).
  const { rosterMembers, subMembers } = useMemo(
    () => ({
      rosterMembers: members.filter((m) => !m.is_substitute),
      subMembers: members.filter((m) => m.is_substitute),
    }),
    [members]
  );

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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        {/* Banner */}
        {team?.banner_url && (
          <div className="relative h-48 md:h-56 w-full overflow-hidden">
            <Image
              src={team.banner_url}
              alt=""
              fill
              className="object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent" />
          </div>
        )}

        <div
          className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${
            team?.banner_url ? '-mt-20 relative z-10' : 'pt-20'
          } pb-12`}
        >
          {/* Header */}
          <div className="mb-8">
            <Breadcrumb
              items={[
                { label: t.breadcrumbTeams, href: '/admin/teams' },
                {
                  label: team?.name || t.breadcrumbTeam,
                  href: `/admin/teams/${teamId}`,
                },
                { label: t.breadcrumbEdit },
              ]}
            />
            <button
              type="button"
              onClick={() => router.push('/admin/teams')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              {t.backToList}
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {team?.logo_url && (
                  <Image
                    src={team.logo_url}
                    alt={team.name}
                    width={64}
                    height={64}
                    className="w-16 h-16 rounded-xl object-cover border-2 border-neutral-700 shadow-lg"
                  />
                )}
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                    {team?.name || t.loading}
                  </h1>
                  {team?.short_name && (
                    <p className="text-sm text-neutral-400 mt-1">
                      <span className="font-mono text-xs bg-neutral-800/80 px-2 py-0.5 rounded">
                        {team.short_name}
                      </span>
                      {team.country && (
                        <span className="ml-2">{team.country}</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {team && (
                <div className="flex items-center gap-2">
                  {team.is_active ? (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                      {t.active}
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-neutral-600/20 text-neutral-300 border border-neutral-500/30">
                      {t.inactive}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {errorMsg}
            </div>
          )}
          {loading && !team && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {team && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left Column - Edit Form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Team Info Form */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-neutral-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    {t.generalInfo}
                  </h2>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          {t.nameLabel}
                        </label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder={t.namePlaceholder}
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          {t.shortNameLabel}
                        </label>
                        <input
                          type="text"
                          value={shortName}
                          onChange={(e) => setShortName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="PHX"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <LogoUpload
                        value={logoUrl}
                        onChange={setLogoUrl}
                        label={t.logoLabel}
                      />
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          {t.bannerLabel}
                        </label>
                        <input
                          type="text"
                          value={bannerUrl}
                          onChange={(e) => setBannerUrl(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          {t.countryLabel}
                        </label>
                        <input
                          type="text"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="FR"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-6">
                        <input
                          id="active"
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) => setIsActive(e.target.checked)}
                          className="h-4 w-4 rounded border-neutral-600 bg-neutral-700"
                        />
                        <label
                          htmlFor="active"
                          className="text-sm text-neutral-300"
                        >
                          {t.teamActive}
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-400 mb-1">
                        {t.descriptionLabel}
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[100px] resize-y"
                        placeholder={t.descriptionPlaceholder}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          {t.twitterLabel}
                        </label>
                        <input
                          type="text"
                          value={twitter}
                          onChange={(e) => setTwitter(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="@team"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          {t.discordLabel}
                        </label>
                        <input
                          type="text"
                          value={discord}
                          onChange={(e) => setDiscord(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="discord.gg/..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          {t.discordRoleIdLabel}
                        </label>
                        <input
                          type="text"
                          value={discordRoleId}
                          onChange={(e) => setDiscordRoleId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                          placeholder="1234567890123456789"
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                          {t.discordRoleIdHelp}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          {t.websiteLabel}
                        </label>
                        <input
                          type="text"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          {t.saving}
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          {t.save}
                        </>
                      )}
                    </button>
                  </form>
                </section>

                {/* Members Section */}
                <MembersSection
                  membersCount={members.length}
                  membersLoading={membersLoading}
                  rosterMembers={rosterMembers}
                  subMembers={subMembers}
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

                {/* Tournaments Section */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-neutral-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                      />
                    </svg>
                    {t.tournamentsTitle}
                  </h2>

                  {tournamentsLoading ? (
                    <div className="text-neutral-400 text-sm py-4">
                      {t.loading}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Registered tournaments */}
                      <div>
                        <h3 className="text-sm font-semibold text-neutral-400 mb-2">
                          {format(t.registeredTitle, {
                            count: registeredTournaments.length,
                          })}
                        </h3>
                        {registeredTournaments.length === 0 ? (
                          <div className="text-sm text-neutral-500 py-4 text-center bg-neutral-900/30 rounded-xl">
                            {t.noRegistration}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {registeredTournaments.map((tourn) => (
                              <div
                                key={tourn.id}
                                className="flex items-center justify-between gap-3 bg-neutral-900/50 rounded-xl px-4 py-3"
                              >
                                <div>
                                  <div className="font-medium text-sm">
                                    {tourn.name}
                                  </div>
                                  <div className="text-xs text-neutral-500 mt-0.5">
                                    {tourn.game} • {tourn.status}
                                  </div>
                                </div>
                                <button
                                  onClick={() =>
                                    handleUnregisterFromTournament(tourn.id)
                                  }
                                  className="px-3 py-1 rounded-lg text-xs font-medium bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-700/50 transition-colors"
                                >
                                  {t.unregister}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Register to new tournament */}
                      {availableTournaments.length > 0 && (
                        <div className="pt-4 border-t border-neutral-700">
                          <h3 className="text-sm font-semibold text-neutral-400 mb-2">
                            {t.registerToTournament}
                          </h3>
                          <div className="flex gap-2">
                            <select
                              value={selectedTournamentId}
                              onChange={(e) =>
                                setSelectedTournamentId(e.target.value)
                              }
                              className="flex-1 px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            >
                              <option value="">{t.selectTournament}</option>
                              {availableTournaments.map((tourn) => (
                                <option key={tourn.id} value={tourn.id}>
                                  {tourn.name} ({tourn.game})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={handleRegisterToTournament}
                              disabled={
                                !selectedTournamentId || tournamentsLoading
                              }
                              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                            >
                              {t.register}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>

              {/* Right Column - Quick Info */}
              <div className="space-y-6">
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                  <h2 className="text-sm font-semibold text-neutral-400 mb-3">
                    {t.systemInfoTitle}
                  </h2>
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">
                        {t.teamIdLabel}
                      </div>
                      <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
                        {team.id}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                  <h2 className="text-sm font-semibold text-neutral-400 mb-3">
                    {t.quickLinksTitle}
                  </h2>
                  <div className="space-y-2">
                    <Link
                      href={`/team/${encodeURIComponent(team.slug || team.id)}`}
                      target="_blank"
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-blue-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </div>
                        <span className="text-sm">{t.publicPage}</span>
                      </div>
                      <svg
                        className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Link>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Member Modal */}
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

      {/* Edit Member Modal */}
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

      {/* Import BattleTags Modal */}
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
