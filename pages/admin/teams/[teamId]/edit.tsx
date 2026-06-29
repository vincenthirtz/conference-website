import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import Breadcrumb from '@/components/admin/Breadcrumb';
import Modal from '@/components/admin/Modal';
import LogoUpload from '@/components/admin/LogoUpload';
import { supabaseAdmin } from '@/utils/supabase';
import {
  loadTeamRolesFromSupabase,
  DEFAULT_TEAM_ROLES,
  type TeamRole,
} from '@/utils/teamRoles';
import type { StaffProps, TeamRow, TeamMemberRow } from '@/types/admin';

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

export const getServerSideProps = withStaffPage<{ teamRoles: TeamRole[] }>(
  'manager',
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
  const router = useRouter();
  const { teamId } = router.query as { teamId?: string };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { addToast } = useToast();
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
  const [memberForm, setMemberForm] = useState({
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
  type ImportLine = {
    raw: string;
    key: string;
    tag: string;
    status: 'matched' | 'invalid' | 'not-found' | 'empty';
    memberId?: string;
    memberLabel?: string;
  };
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<ImportLine[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const BATTLE_TAG_RE = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;

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
  type SearchResult = {
    id: string;
    email: string | null;
    display_name: string | null;
    battle_tag: string | null;
    team_id: string | null;
    team_name: string | null;
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const fetchTeam = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const json = await adminFetchJson<{ team: TeamRow }>(
        `/api/admin/teams/${teamId}`
      );

      const t: TeamRow = json.team;
      setTeam(t);
      setName(t.name || '');
      setShortName(t.short_name || '');
      setLogoUrl(t.logo_url || '');
      setBannerUrl(t.banner_url || '');
      setCountry(t.country || '');
      setDescription(t.description || '');
      setTwitter(t.twitter || '');
      setDiscord(t.discord || '');
      setDiscordRoleId(t.discord_role_id || '');
      setWebsite(t.website || '');
      setIsActive(t.is_active !== false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [teamId, adminFetchJson]);

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
  }, [teamId, fetchTeam, fetchMembers, fetchTournaments]);

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

      addToast('Équipe mise à jour', 'success');
      setTeam(json.team);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
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
        throw new Error(json.error || "Échec de l'inscription");
      }

      setSelectedTournamentId('');
      await fetchTournaments();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setTournamentsLoading(false);
    }
  }

  async function handleUnregisterFromTournament(tournamentId: string) {
    if (!teamId) return;
    if (!confirm('Désinscrire cette équipe de ce tournoi ?')) return;

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
  function openAddMemberModal() {
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
  }

  async function handleSearchPlayers(query: string) {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setSearchLoading(true);
    setShowSearchResults(true);
    try {
      const res = await fetch(
        `/api/admin/users/search?q=${encodeURIComponent(query)}`
      );
      const json = await res.json();
      if (res.ok && json.players) {
        setSearchResults(json.players);
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function selectPlayer(player: SearchResult) {
    setMemberForm({
      ...memberForm,
      email: player.email || '',
      userId: player.id,
      battleTag: player.battle_tag || '',
    });
    setShowSearchResults(false);
    setSearchQuery(
      player.email || player.battle_tag || player.display_name || ''
    );
  }

  function openEditMemberModal(member: TeamMemberRow) {
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
  }

  async function handleAddMember() {
    if (!teamId) return;
    if (!memberForm.email.trim() && !memberForm.userId.trim()) {
      setMemberError('Email ou User ID requis');
      return;
    }
    if (!memberForm.battleTag.trim()) {
      setMemberError('BattleTag est obligatoire');
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
        throw new Error(json.error || "Impossible d'ajouter le membre");
      }

      setShowAddMemberModal(false);
      addToast('Membre ajouté', 'success');
      await fetchMembers();
    } catch (err: unknown) {
      setMemberError((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setMemberSaving(false);
    }
  }

  async function handleEditMember() {
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
      addToast('Membre modifié', 'success');
      await fetchMembers();
    } catch (err: unknown) {
      setMemberError((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setMemberSaving(false);
    }
  }

  async function handleDeleteMember(member: TeamMemberRow) {
    if (!teamId) return;
    if (
      !confirm(`Retirer ${member.battle_tag || member.user_id} de l'équipe ?`)
    )
      return;

    try {
      const res = await adminFetch(`/api/admin/teams/${teamId}/members`, {
        method: 'DELETE',
        body: JSON.stringify({ memberId: member.id }),
      });

      if (res.ok) {
        addToast('Membre retiré', 'success');
        await fetchMembers();
        await fetchTeam();
      }
    } catch {
      // Silently fail
    }
  }

  async function handleSetCaptain(member: TeamMemberRow) {
    if (!teamId) return;
    if (
      !confirm(
        `Définir ${member.battle_tag || member.user_id} comme capitaine ?`
      )
    )
      return;

    try {
      const json = await adminFetchJson<{ team: TeamRow }>(
        `/api/admin/teams/${teamId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ captain_id: member.user_id }),
        }
      );

      setTeam(json.team);
      addToast('Capitaine défini', 'success');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    }
  }

  async function handleSwap(memberA: TeamMemberRow, memberB: TeamMemberRow) {
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
      addToast('Échange effectué', 'success');
      await fetchMembers();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    }
  }

  // --- Bulk actions -------------------------------------------------------
  const captainUserId = team?.captain_id ?? null;
  const selectedMembers = members.filter((m) => selectedIds.has(m.id));
  const selectionHasCaptain = selectedMembers.some(
    (m) => captainUserId !== null && m.user_id === captainUserId
  );

  async function runBulk(
    operation: 'set_role' | 'set_substitute' | 'remove',
    extra: Record<string, unknown> = {}
  ) {
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
          ? `${successCount} appliqué(s), ${failureCount} ignoré(s)`
          : `${successCount} membre(s) mis à jour`,
        failureCount > 0 ? 'info' : 'success'
      );
      clearSelection();
      setBulkRole('');
      await fetchMembers();
      await fetchTeam();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkRemove() {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Retirer ${selectedIds.size} membre(s) de l'équipe ? Le capitaine est protégé et ne sera pas retiré.`
      )
    )
      return;
    await runBulk('remove');
  }

  // --- BattleTag import ---------------------------------------------------
  function buildImportPreview() {
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
  }

  async function applyImport() {
    if (!teamId || !importPreview) return;
    const items = importPreview
      .filter((l) => l.status === 'matched' && l.memberId)
      .map((l) => ({ memberId: l.memberId as string, battleTag: l.tag }));
    if (items.length === 0) {
      setErrorMsg('Aucune ligne valide à importer');
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
          ? `${successCount} BattleTag(s) importé(s), ${failureCount} échoué(s)`
          : `${successCount} BattleTag(s) importé(s)`,
        failureCount > 0 ? 'info' : 'success'
      );
      setShowImportModal(false);
      setImportText('');
      setImportPreview(null);
      await fetchMembers();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>{`Admin – Éditer équipe${team?.name ? ` : ${team.name}` : ''}`}</title>
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
                { label: 'Équipes', href: '/admin/teams' },
                {
                  label: team?.name || 'Équipe',
                  href: `/admin/teams/${teamId}`,
                },
                { label: 'Modifier' },
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
              Retour à la liste
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
                    {team?.name || 'Chargement...'}
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
                      Active
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-neutral-600/20 text-neutral-300 border border-neutral-500/30">
                      Inactive
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
                    Informations générales
                  </h2>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          Nom *
                        </label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="Nom de l'équipe"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          Tag / Short name
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
                        label="Logo"
                      />
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          URL Bannière
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
                          Pays
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
                          Équipe active
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-400 mb-1">
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[100px] resize-y"
                        placeholder="Présentation de l'équipe"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          Twitter
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
                          Discord
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
                          ID rôle Discord
                        </label>
                        <input
                          type="text"
                          value={discordRoleId}
                          onChange={(e) => setDiscordRoleId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                          placeholder="1234567890123456789"
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                          Pingé automatiquement lors des annonces de match
                          (J-15min, résultats).
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm text-neutral-400 mb-1">
                          Site web
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
                          Enregistrement...
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
                          Enregistrer
                        </>
                      )}
                    </button>
                  </form>
                </section>

                {/* Members Section */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
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
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                      Membres ({members.length})
                    </h2>
                    <div className="flex items-center gap-2">
                      {swapSource && (
                        <button
                          onClick={() => setSwapSource(null)}
                          className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                        >
                          Annuler l&apos;échange
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setImportText('');
                          setImportPreview(null);
                          setShowImportModal(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors flex items-center gap-1.5"
                        data-testid="open-import-modal"
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
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Importer BattleTags
                      </button>
                      <button
                        onClick={openAddMemberModal}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-1.5"
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
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Ajouter
                      </button>
                    </div>
                  </div>

                  {swapSource && (
                    <div className="mb-4 rounded-xl bg-blue-900/30 border border-blue-500/40 px-4 py-3 text-sm flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-blue-400 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                        />
                      </svg>
                      <span>
                        Sélectionnez un membre pour échanger avec{' '}
                        <strong>{swapSource.battle_tag}</strong>
                      </span>
                    </div>
                  )}

                  {/* Bulk actions toolbar */}
                  {!swapSource && !membersLoading && members.length > 0 && (
                    <div
                      className="mb-4 rounded-xl bg-neutral-900/50 border border-neutral-700/60 px-4 py-3"
                      data-testid="bulk-toolbar"
                    >
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                        <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            data-testid="select-all-members"
                            checked={
                              members.length > 0 &&
                              selectedIds.size === members.length
                            }
                            ref={(el) => {
                              if (el)
                                el.indeterminate =
                                  selectedIds.size > 0 &&
                                  selectedIds.size < members.length;
                            }}
                            onChange={(e) => {
                              if (e.target.checked)
                                setSelectedIds(
                                  new Set(members.map((m) => m.id))
                                );
                              else clearSelection();
                            }}
                            className="h-4 w-4 rounded border-neutral-600 bg-neutral-700"
                          />
                          <span data-testid="selection-count">
                            {selectedIds.size > 0
                              ? `${selectedIds.size} sélectionné(s)`
                              : 'Tout sélectionner'}
                          </span>
                        </label>

                        {selectedIds.size > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Bulk role */}
                            <div className="flex items-center gap-1.5">
                              <select
                                value={bulkRole}
                                onChange={(e) => setBulkRole(e.target.value)}
                                disabled={bulkBusy}
                                data-testid="bulk-role-select"
                                className="px-2.5 py-1.5 rounded-lg bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="">Rôle…</option>
                                {teamRoles.map((r) => (
                                  <option key={r.value} value={r.value}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() =>
                                  runBulk('set_role', { role: bulkRole })
                                }
                                disabled={!bulkRole || bulkBusy}
                                data-testid="bulk-role-apply"
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                              >
                                Appliquer
                              </button>
                            </div>

                            {/* Bulk substitute */}
                            <button
                              onClick={() =>
                                runBulk('set_substitute', {
                                  isSubstitute: true,
                                })
                              }
                              disabled={bulkBusy}
                              data-testid="bulk-mark-sub"
                              className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-sm font-medium transition-colors"
                            >
                              Marquer remplaçant
                            </button>
                            <button
                              onClick={() =>
                                runBulk('set_substitute', {
                                  isSubstitute: false,
                                })
                              }
                              disabled={bulkBusy}
                              data-testid="bulk-unmark-sub"
                              className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-sm font-medium transition-colors"
                            >
                              Retirer remplaçant
                            </button>

                            {/* Bulk remove */}
                            <button
                              onClick={handleBulkRemove}
                              disabled={bulkBusy}
                              data-testid="bulk-remove"
                              className="px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-900/70 text-red-200 border border-red-700/50 disabled:opacity-50 text-sm font-medium transition-colors"
                            >
                              Retirer de l&apos;équipe
                            </button>

                            <button
                              onClick={clearSelection}
                              disabled={bulkBusy}
                              className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-white text-sm transition-colors"
                            >
                              Désélectionner
                            </button>
                          </div>
                        )}
                      </div>
                      {selectionHasCaptain && (
                        <p className="mt-2 text-xs text-amber-300/90 flex items-center gap-1.5">
                          <svg
                            className="w-3.5 h-3.5 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Le capitaine est protégé : il ne sera ni retiré ni
                          passé remplaçant.
                        </p>
                      )}
                    </div>
                  )}

                  {membersLoading ? (
                    <div className="text-neutral-400 text-sm py-4">
                      Chargement...
                    </div>
                  ) : members.length === 0 ? (
                    <div className="text-neutral-400 text-sm py-8 text-center bg-neutral-900/30 rounded-xl">
                      Aucun membre dans cette équipe
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Roster (active members) */}
                      {(() => {
                        const rosterMembers = members.filter(
                          (m) => !m.is_substitute
                        );
                        const subMembers = members.filter(
                          (m) => m.is_substitute
                        );

                        return (
                          <>
                            <div>
                              <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2">
                                Roster ({rosterMembers.length})
                              </h3>
                              {rosterMembers.length === 0 ? (
                                <div className="text-neutral-500 text-sm py-4 text-center bg-neutral-900/30 rounded-xl">
                                  Aucun joueur actif
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {rosterMembers.map((member) => {
                                    const isCaptain =
                                      team?.captain_id === member.user_id;
                                    const isSwapTarget =
                                      swapSource && swapSource.id !== member.id;
                                    return (
                                      <div
                                        key={member.id}
                                        className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 group ${
                                          isCaptain
                                            ? 'bg-amber-900/20 border border-amber-500/30'
                                            : swapSource?.id === member.id
                                              ? 'bg-blue-900/30 border border-blue-500/40'
                                              : 'bg-neutral-900/50'
                                        } ${isSwapTarget ? 'cursor-pointer hover:border-blue-500/40 hover:bg-blue-900/20 border border-transparent' : ''}`}
                                        onClick={
                                          isSwapTarget
                                            ? () =>
                                                handleSwap(swapSource!, member)
                                            : undefined
                                        }
                                      >
                                        <div className="flex items-center gap-3 min-w-0">
                                          {!swapSource && (
                                            <input
                                              type="checkbox"
                                              data-testid={`member-checkbox-${member.id}`}
                                              checked={selectedIds.has(
                                                member.id
                                              )}
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                              onChange={() =>
                                                toggleSelected(member.id)
                                              }
                                              className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 flex-shrink-0"
                                            />
                                          )}
                                          <div
                                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                              isCaptain
                                                ? 'bg-amber-500/20 text-amber-400'
                                                : 'bg-neutral-700 text-neutral-400'
                                            }`}
                                          >
                                            {isCaptain ? (
                                              <svg
                                                className="w-5 h-5"
                                                fill="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                                              </svg>
                                            ) : (
                                              <svg
                                                className="w-5 h-5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                                />
                                              </svg>
                                            )}
                                          </div>
                                          <div className="min-w-0">
                                            <div className="font-medium text-sm truncate flex items-center gap-2">
                                              {member.battle_tag || 'Membre'}
                                              {isCaptain && (
                                                <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                                                  Capitaine
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                                {member.role}
                                              </span>
                                              <span className="text-xs text-neutral-500 font-mono truncate">
                                                {member.user_id.slice(0, 8)}...
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        {!swapSource && (
                                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {subMembers.length > 0 && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSwapSource(member);
                                                }}
                                                className="p-2 rounded-lg hover:bg-blue-900/50 text-neutral-400 hover:text-blue-400 transition-colors"
                                                title="Échanger avec un remplaçant"
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
                                                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                                  />
                                                </svg>
                                              </button>
                                            )}
                                            {!isCaptain && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleSetCaptain(member);
                                                }}
                                                className="p-2 rounded-lg hover:bg-amber-900/50 text-neutral-400 hover:text-amber-400 transition-colors"
                                                title="Définir comme capitaine"
                                              >
                                                <svg
                                                  className="w-4 h-4"
                                                  fill="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                                                </svg>
                                              </button>
                                            )}
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openEditMemberModal(member);
                                              }}
                                              className="p-2 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                                              title="Modifier"
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
                                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteMember(member);
                                              }}
                                              className="p-2 rounded-lg hover:bg-red-900/50 text-neutral-400 hover:text-red-400 transition-colors"
                                              title="Supprimer"
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
                                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                />
                                              </svg>
                                            </button>
                                          </div>
                                        )}
                                        {isSwapTarget && (
                                          <span className="text-xs text-blue-400 font-medium">
                                            Cliquer pour échanger
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Substitutes */}
                            <div>
                              <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2">
                                Remplaçants ({subMembers.length})
                              </h3>
                              {subMembers.length === 0 ? (
                                <div className="text-neutral-500 text-sm py-4 text-center bg-neutral-900/30 rounded-xl">
                                  Aucun remplaçant
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {subMembers.map((member) => {
                                    const isSwapTarget =
                                      swapSource && swapSource.id !== member.id;
                                    return (
                                      <div
                                        key={member.id}
                                        className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 group ${
                                          swapSource?.id === member.id
                                            ? 'bg-blue-900/30 border border-blue-500/40'
                                            : 'bg-neutral-900/30 border border-dashed border-neutral-700'
                                        } ${isSwapTarget ? 'cursor-pointer hover:border-blue-500/40 hover:bg-blue-900/20' : ''}`}
                                        onClick={
                                          isSwapTarget
                                            ? () =>
                                                handleSwap(swapSource!, member)
                                            : undefined
                                        }
                                      >
                                        <div className="flex items-center gap-3 min-w-0">
                                          {!swapSource && (
                                            <input
                                              type="checkbox"
                                              data-testid={`member-checkbox-${member.id}`}
                                              checked={selectedIds.has(
                                                member.id
                                              )}
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                              onChange={() =>
                                                toggleSelected(member.id)
                                              }
                                              className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 flex-shrink-0"
                                            />
                                          )}
                                          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-neutral-800 text-neutral-500">
                                            <svg
                                              className="w-5 h-5"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                              />
                                            </svg>
                                          </div>
                                          <div className="min-w-0">
                                            <div className="font-medium text-sm truncate flex items-center gap-2 text-neutral-300">
                                              {member.battle_tag || 'Membre'}
                                              <span className="px-1.5 py-0.5 rounded text-xs bg-neutral-700 text-neutral-400 border border-neutral-600">
                                                Remplaçant
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                                {member.role}
                                              </span>
                                              <span className="text-xs text-neutral-500 font-mono truncate">
                                                {member.user_id.slice(0, 8)}...
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        {!swapSource && (
                                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {rosterMembers.length > 0 && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSwapSource(member);
                                                }}
                                                className="p-2 rounded-lg hover:bg-blue-900/50 text-neutral-400 hover:text-blue-400 transition-colors"
                                                title="Échanger avec un joueur du roster"
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
                                                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                                  />
                                                </svg>
                                              </button>
                                            )}
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openEditMemberModal(member);
                                              }}
                                              className="p-2 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                                              title="Modifier"
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
                                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteMember(member);
                                              }}
                                              className="p-2 rounded-lg hover:bg-red-900/50 text-neutral-400 hover:text-red-400 transition-colors"
                                              title="Supprimer"
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
                                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                />
                                              </svg>
                                            </button>
                                          </div>
                                        )}
                                        {isSwapTarget && (
                                          <span className="text-xs text-blue-400 font-medium">
                                            Cliquer pour échanger
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </section>

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
                    Tournois
                  </h2>

                  {tournamentsLoading ? (
                    <div className="text-neutral-400 text-sm py-4">
                      Chargement...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Registered tournaments */}
                      <div>
                        <h3 className="text-sm font-semibold text-neutral-400 mb-2">
                          Inscrits ({registeredTournaments.length})
                        </h3>
                        {registeredTournaments.length === 0 ? (
                          <div className="text-sm text-neutral-500 py-4 text-center bg-neutral-900/30 rounded-xl">
                            Aucune inscription
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {registeredTournaments.map((t) => (
                              <div
                                key={t.id}
                                className="flex items-center justify-between gap-3 bg-neutral-900/50 rounded-xl px-4 py-3"
                              >
                                <div>
                                  <div className="font-medium text-sm">
                                    {t.name}
                                  </div>
                                  <div className="text-xs text-neutral-500 mt-0.5">
                                    {t.game} • {t.status}
                                  </div>
                                </div>
                                <button
                                  onClick={() =>
                                    handleUnregisterFromTournament(t.id)
                                  }
                                  className="px-3 py-1 rounded-lg text-xs font-medium bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-700/50 transition-colors"
                                >
                                  Désinscrire
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
                            Inscrire à un tournoi
                          </h3>
                          <div className="flex gap-2">
                            <select
                              value={selectedTournamentId}
                              onChange={(e) =>
                                setSelectedTournamentId(e.target.value)
                              }
                              className="flex-1 px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            >
                              <option value="">
                                Sélectionner un tournoi...
                              </option>
                              {availableTournaments.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.game})
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
                              Inscrire
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
                    Informations système
                  </h2>
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">
                        ID de l&apos;équipe
                      </div>
                      <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
                        {team.id}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                  <h2 className="text-sm font-semibold text-neutral-400 mb-3">
                    Liens rapides
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
                        <span className="text-sm">Page publique</span>
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
      <Modal
        open={showAddMemberModal}
        onClose={() => setShowAddMemberModal(false)}
        size="2xl"
        backdropClassName="bg-black/70 backdrop-blur-md"
        panelChromeClassName="bg-gradient-to-b from-neutral-800 to-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl ring-1 ring-emerald-500/10 overflow-hidden"
        panelClassName="max-h-[90vh]"
        title={
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white">
                Ajouter un joueur
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Recherchez un membre existant ou saisissez ses informations
              </p>
            </div>
          </div>
        }
        footer={
          <>
            <button
              onClick={() => setShowAddMemberModal(false)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleAddMember}
              disabled={memberSaving}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-emerald-900/40"
            >
              {memberSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Ajout...
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Ajouter le joueur
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Search section */}
          <div className="relative">
            <label className="block text-sm font-medium text-neutral-200 mb-1.5">
              Rechercher un joueur existant
            </label>
            <p className="text-xs text-neutral-500 mb-2">
              Par email, nom ou BattleTag
            </p>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchPlayers(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-neutral-900/70 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 text-sm placeholder:text-neutral-500 transition-colors"
                placeholder="Tapez au moins 2 caractères..."
              />
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {searchLoading && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Search results dropdown */}
            {showSearchResults && (
              <div className="absolute z-10 w-full mt-1.5 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto ring-1 ring-black/40">
                {searchResults.length === 0 && !searchLoading ? (
                  <div className="px-4 py-3 text-sm text-neutral-400 text-center">
                    Aucun résultat trouvé
                  </div>
                ) : (
                  searchResults.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => selectPlayer(player)}
                      className="w-full px-3 py-2.5 text-left hover:bg-neutral-700/70 transition-colors flex items-center gap-3 border-b border-neutral-800 last:border-b-0"
                    >
                      <div className="w-9 h-9 rounded-lg bg-neutral-700 flex items-center justify-center flex-shrink-0">
                        <svg
                          className="w-4 h-4 text-neutral-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate text-white">
                          {player.battle_tag ||
                            player.display_name ||
                            player.email ||
                            'Joueur'}
                        </div>
                        <div className="text-xs text-neutral-400 truncate">
                          {player.email}
                          {player.team_name && (
                            <span className="ml-2 text-amber-400">
                              Équipe: {player.team_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* OR separator */}
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="flex-1 h-px bg-neutral-700" />
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              ou saisir manuellement
            </span>
            <div className="flex-1 h-px bg-neutral-700" />
          </div>

          {/* Manual entry */}
          <div className="rounded-xl bg-neutral-900/40 border border-neutral-700/60 p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-1.5">
                  Email utilisateur
                </label>
                <input
                  type="email"
                  value={memberForm.email}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, email: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 text-sm placeholder:text-neutral-500 transition-colors"
                  placeholder="user@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-1.5">
                  Ou User ID
                </label>
                <input
                  type="text"
                  value={memberForm.userId}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, userId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 text-sm font-mono placeholder:text-neutral-500 transition-colors"
                  placeholder="UUID"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-200 mb-1.5">
                BattleTag <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={memberForm.battleTag}
                onChange={(e) =>
                  setMemberForm({
                    ...memberForm,
                    battleTag: e.target.value,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 text-sm placeholder:text-neutral-500 transition-colors"
                placeholder="Pseudo#1234"
              />
              <p className="text-xs text-neutral-500 mt-1.5">
                Format : Pseudo#0000
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-200 mb-1.5">
                Rôle dans l&apos;équipe
              </label>
              <select
                value={memberForm.role}
                onChange={(e) =>
                  setMemberForm({ ...memberForm, role: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 text-sm placeholder:text-neutral-500 transition-colors"
              >
                {teamRoles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status toggles */}
          <div>
            <label className="block text-sm font-medium text-neutral-200 mb-2">
              Statut
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  memberForm.setCaptain
                    ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/40'
                    : 'bg-neutral-900/40 border-neutral-700 hover:border-neutral-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={memberForm.setCaptain}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      setCaptain: e.target.checked,
                      isSubstitute: false,
                    })
                  }
                  className="sr-only"
                />
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    memberForm.setCaptain
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-neutral-800 text-neutral-500'
                  }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l2.39 7.36H22l-6.18 4.49L18.21 22 12 17.27 5.79 22l2.39-8.15L2 9.36h7.61z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">
                    Capitaine
                  </div>
                  <div className="text-xs text-neutral-400">
                    Chef d&apos;équipe
                  </div>
                </div>
              </label>

              <label
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  memberForm.isSubstitute
                    ? 'bg-blue-500/10 border-blue-500/60 ring-1 ring-blue-500/40'
                    : 'bg-neutral-900/40 border-neutral-700 hover:border-neutral-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={memberForm.isSubstitute}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      isSubstitute: e.target.checked,
                      setCaptain: false,
                    })
                  }
                  className="sr-only"
                />
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    memberForm.isSubstitute
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-neutral-800 text-neutral-500'
                  }`}
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
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">
                    Remplaçant
                  </div>
                  <div className="text-xs text-neutral-400">
                    Joueur de réserve
                  </div>
                </div>
              </label>
            </div>
          </div>

          {memberError && (
            <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2.5 text-sm text-red-200 flex items-start gap-2">
              <svg
                className="w-4 h-4 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{memberError}</span>
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Member Modal */}
      <Modal
        open={Boolean(showEditMemberModal && editingMember)}
        onClose={() => {
          setShowEditMemberModal(false);
          setEditingMember(null);
        }}
        title="Modifier le membre"
        footer={
          <>
            <button
              onClick={() => {
                setShowEditMemberModal(false);
                setEditingMember(null);
              }}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleEditMember}
              disabled={memberSaving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {memberSaving && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {memberSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </>
        }
      >
        {editingMember && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                User ID
              </label>
              <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
                {editingMember.user_id}
              </div>
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                BattleTag
              </label>
              <input
                type="text"
                value={memberForm.battleTag}
                onChange={(e) =>
                  setMemberForm({ ...memberForm, battleTag: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="Pseudo#1234"
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                Rôle
              </label>
              <select
                value={memberForm.role}
                onChange={(e) =>
                  setMemberForm({ ...memberForm, role: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {teamRoles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={memberForm.isSubstitute}
                onChange={(e) =>
                  setMemberForm({
                    ...memberForm,
                    isSubstitute: e.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-700"
              />
              <span>Remplaçant</span>
            </label>

            {memberError && (
              <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm text-red-200">
                {memberError}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Import BattleTags Modal */}
      <Modal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        size="2xl"
        backdropClassName="bg-black/70 backdrop-blur-md"
        panelChromeClassName="bg-gradient-to-b from-neutral-800 to-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden"
        panelClassName="max-h-[90vh]"
        dataTestId="import-modal"
        title={
          <h3 className="text-lg font-semibold text-white">
            Importer des BattleTags
          </h3>
        }
        subtitle={
          <>
            Une ligne par membre :{' '}
            <code className="font-mono">identifiant,BattleTag#1234</code>
            <br />
            L&apos;identifiant peut être un BattleTag actuel, un User ID ou un
            ID de membre.
          </>
        }
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-xs text-neutral-400">
              {importPreview
                ? `${importPreview.filter((l) => l.status === 'matched').length} à appliquer`
                : ''}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={applyImport}
                disabled={
                  importBusy ||
                  !importPreview ||
                  importPreview.filter((l) => l.status === 'matched').length ===
                    0
                }
                data-testid="import-apply-btn"
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {importBusy && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                Appliquer les BattleTags
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <textarea
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportPreview(null);
            }}
            data-testid="import-textarea"
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/70 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono min-h-[140px] resize-y"
            placeholder={'Old#1234,New#5678\nuuid-du-membre,Pseudo#0001'}
          />

          <button
            onClick={buildImportPreview}
            disabled={!importText.trim()}
            data-testid="import-preview-btn"
            className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            Prévisualiser
          </button>

          {importPreview && (
            <div
              className="rounded-xl border border-neutral-700 overflow-hidden"
              data-testid="import-preview"
            >
              <table className="w-full text-sm">
                <thead className="bg-neutral-900/60 text-neutral-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Identifiant</th>
                    <th className="text-left px-3 py-2">BattleTag</th>
                    <th className="text-left px-3 py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-4 text-center text-neutral-500"
                      >
                        Aucune ligne
                      </td>
                    </tr>
                  ) : (
                    importPreview.map((line, i) => (
                      <tr
                        key={i}
                        className="border-t border-neutral-800"
                        data-testid={`import-row-${line.status}`}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-neutral-300 truncate max-w-[200px]">
                          {line.memberLabel || line.key || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {line.tag || '—'}
                        </td>
                        <td className="px-3 py-2">
                          {line.status === 'matched' && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Trouvé
                            </span>
                          )}
                          {line.status === 'invalid' && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-300 border border-red-500/30">
                              Format invalide
                            </span>
                          )}
                          {line.status === 'not-found' && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Introuvable
                            </span>
                          )}
                          {line.status === 'empty' && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-700 text-neutral-400 border border-neutral-600">
                              Ligne incomplète
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

export default AdminEditTeamPage;
