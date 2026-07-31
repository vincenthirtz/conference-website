import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import Modal from '@/components/admin/Modal';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import {
  BATTLE_TAG_REGEX,
  roleRequiresBattleTag,
} from '@/utils/teams/addMember';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { MemberRosterRow } from '@/components/admin/teams/my/MemberRosterRow';
import { PlayerSearchResults } from '@/components/admin/teams/my/PlayerSearchResults';
import type { Member, SearchResult } from '@/components/admin/teams/my/types';

import { logger } from '../../../utils/logger';
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
  const t = useAdminT('adminTeamsMy');
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

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
  type JoinRequest = {
    id: string;
    user_id: string;
    status: string;
    comment: string | null;
    payload: any;
    created_at: string;
    user: {
      id: string;
      email: string | null;
      display_name: string | null;
      battle_tag: string | null;
    } | null;
  };
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

  // Inline member editing (BattleTag) + substitute / captain actions
  const [editingBattleTagId, setEditingBattleTagId] = useState<string | null>(
    null
  );
  const [battleTagDraft, setBattleTagDraft] = useState('');
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);

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
        let url = '/api/admin/teams/my';
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
    [isStaffAdmin, adminFetchJson, t]
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
          `/api/teams/search-players?q=${encodeURIComponent(query)}`,
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
    [adminFetchJson]
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

      const res = await adminFetch(url, {
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
      // L'email d'invitation est best-effort cote API : on previent l'admin
      // si le membre a bien ete ajoute mais que le mail n'est pas parti.
      if (json?.emailWarning) {
        addToast(
          format(t.memberAddedWithWarning, { warning: json.emailWarning }),
          'warning'
        );
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
    setJoinRequestsLoading(true);
    try {
      const json = await adminFetchJson<{ demandes?: JoinRequest[] }>(
        '/api/teams/join-requests?status=pending'
      );
      setJoinRequests(json.demandes || []);
    } catch (err) {
      logger.error('Failed to load join requests', err);
    } finally {
      setJoinRequestsLoading(false);
    }
  }, [adminFetchJson]);

  // Toggle joinable status
  const handleToggleJoinable = async () => {
    setTogglingJoinable(true);
    try {
      const res = await adminFetch('/api/teams/toggle-joinable', {
        method: 'POST',
        body: JSON.stringify({ joinable: !isJoinable }),
      });
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

  // Handle approve/reject join request
  const handleJoinRequestAction = async (
    demandeId: string,
    action: 'approve' | 'reject'
  ) => {
    setProcessingRequestId(demandeId);
    try {
      const res = await adminFetch('/api/teams/join-requests', {
        method: 'POST',
        body: JSON.stringify({ demandeId, action }),
      });
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

  // --- Member: inline BattleTag edit --------------------------------------
  // Handlers mémoïsés : identité stable → les lignes <MemberRosterRow> restent
  // mémoïsées et ne se re-rendent pas quand on tape dans la recherche joueur
  // (et inversement). Le brouillon du BattleTag est passé en PARAMÈTRE à
  // `saveBattleTag` (au lieu d'être lu dans la closure) pour éviter que la
  // frappe inline ne change l'identité du handler et ne casse la mémoïsation
  // des autres lignes.
  const startEditBattleTag = useCallback((m: Member) => {
    setEditingBattleTagId(m.id);
    setBattleTagDraft(m.battle_tag || '');
  }, []);

  const cancelEditBattleTag = useCallback(() => {
    setEditingBattleTagId(null);
    setBattleTagDraft('');
  }, []);

  const startSwap = useCallback((m: Member) => {
    setSwapSourceId(m.id);
  }, []);

  const cancelSwap = useCallback(() => {
    setSwapSourceId(null);
  }, []);

  const handleSelectPlayer = useCallback((player: SearchResult) => {
    setSelectedPlayer(player);
    if (player.battle_tag) {
      setNewMemberBattleTag(player.battle_tag);
    }
  }, []);

  const saveBattleTag = useCallback(
    async (m: Member, draft: string) => {
      const trimmed = draft.trim();
      if (!BATTLE_TAG_REGEX.test(trimmed)) {
        addToast(t.errBattleTagInvalid, 'error');
        return;
      }
      if (trimmed === (m.battle_tag || '')) {
        cancelEditBattleTag();
        return;
      }
      setMemberActionId(m.id);
      try {
        // Admins editing an arbitrary team go through the admin members endpoint;
        // captains/managers use the captain-scoped /api/teams route.
        const url =
          isStaffAdmin && selectedTeamId
            ? `/api/admin/teams/${selectedTeamId}/members`
            : '/api/teams/update-member';
        const res = await adminFetch(url, {
          method: 'PATCH',
          body: JSON.stringify({ memberId: m.id, battle_tag: trimmed }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          addToast(json?.error || t.errUpdate, 'error');
          return;
        }
        addToast(t.battleTagUpdated, 'success');
        cancelEditBattleTag();
        await reloadTeam();
      } catch (err) {
        logger.error('saveBattleTag error', err);
        addToast(t.errUpdate, 'error');
      } finally {
        setMemberActionId(null);
      }
    },
    [
      isStaffAdmin,
      selectedTeamId,
      adminFetch,
      addToast,
      t,
      reloadTeam,
      cancelEditBattleTag,
    ]
  );

  // --- Member: substitute toggle ------------------------------------------
  const toggleSubstitute = useCallback(
    async (m: Member) => {
      const next = !(m.is_substitute ?? false);
      setMemberActionId(m.id);
      try {
        const url =
          isStaffAdmin && selectedTeamId
            ? `/api/admin/teams/${selectedTeamId}/members`
            : '/api/teams/update-member';
        const res = await adminFetch(url, {
          method: 'PATCH',
          body: JSON.stringify({ memberId: m.id, is_substitute: next }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          addToast(json?.error || t.errUpdate, 'error');
          return;
        }
        addToast(next ? t.markedSubstitute : t.markedStarter, 'success');
        await reloadTeam();
      } catch (err) {
        logger.error('toggleSubstitute error', err);
        addToast(t.errUpdate, 'error');
      } finally {
        setMemberActionId(null);
      }
    },
    [isStaffAdmin, selectedTeamId, adminFetch, addToast, t, reloadTeam]
  );

  // --- Member: swap starter <-> substitute --------------------------------
  const handleSwapWith = useCallback(
    async (target: Member) => {
      if (!swapSourceId) return;
      const source = data?.members?.find((m) => m.id === swapSourceId);
      if (!source) {
        setSwapSourceId(null);
        return;
      }
      setMemberActionId(target.id);
      try {
        if (isStaffAdmin && selectedTeamId) {
          // Admin path: dedicated swap endpoint (atomic) owned by the api agent.
          const res = await adminFetch(
            `/api/admin/teams/${selectedTeamId}/members`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                memberId: source.id,
                swapWithMemberId: target.id,
              }),
            }
          );
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            addToast(json?.error || t.errSwap, 'error');
            return;
          }
        } else {
          // Captain path: flip both members' is_substitute via update-member.
          // Les deux PATCH sont indépendants → lancés en parallèle (latence
          // divisée par 2, P3-10). L'ordre de vérification des erreurs est
          // conservé : échec du premier → errSwap, échec du second → swapPartial.
          const [r1, r2] = await Promise.all([
            adminFetch('/api/teams/update-member', {
              method: 'PATCH',
              body: JSON.stringify({
                memberId: source.id,
                is_substitute: !(source.is_substitute ?? false),
              }),
            }),
            adminFetch('/api/teams/update-member', {
              method: 'PATCH',
              body: JSON.stringify({
                memberId: target.id,
                is_substitute: !(target.is_substitute ?? false),
              }),
            }),
          ]);
          if (!r1.ok) {
            const j = await r1.json().catch(() => ({}));
            addToast(j?.error || t.errSwap, 'error');
            return;
          }
          if (!r2.ok) {
            const j = await r2.json().catch(() => ({}));
            addToast(j?.error || t.swapPartial, 'error');
            return;
          }
        }
        addToast(t.swapDone, 'success');
        setSwapSourceId(null);
        await reloadTeam();
      } catch (err) {
        logger.error('handleSwapWith error', err);
        addToast(t.errSwap, 'error');
      } finally {
        setMemberActionId(null);
      }
    },
    [
      swapSourceId,
      data?.members,
      isStaffAdmin,
      selectedTeamId,
      adminFetch,
      addToast,
      t,
      reloadTeam,
    ]
  );

  // --- Member: transfer captaincy -----------------------------------------
  const handleTransferCaptain = useCallback(
    async (m: Member) => {
      if (!m.user_id) {
        addToast(t.errCannotBeCaptain, 'error');
        return;
      }
      const ok = await confirm({
        title: t.confirmTransferTitle,
        subtitle: format(t.confirmTransferSubtitle, {
          name: m.display_name || t.thisPlayer,
        }),
        variant: 'warning',
        confirmLabel: t.confirmTransferBtn,
      });
      if (!ok) return;
      setMemberActionId(m.id);
      try {
        if (isStaffAdmin && selectedTeamId) {
          // Admin path: set captain_id directly on the team (api agent endpoint).
          const res = await adminFetch(`/api/admin/teams/${selectedTeamId}`, {
            method: 'PATCH',
            body: JSON.stringify({ captain_id: m.user_id }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || json.error) {
            addToast(json?.error || t.errTransfer, 'error');
            return;
          }
        } else {
          const res = await adminFetch('/api/teams/transfer-captain', {
            method: 'PATCH',
            body: JSON.stringify({ newCaptainUserId: m.user_id }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            addToast(json?.error || t.errTransfer, 'error');
            return;
          }
        }
        addToast(t.captainAssigned, 'success');
        await reloadTeam();
      } catch (err) {
        logger.error('handleTransferCaptain error', err);
        addToast(t.errTransfer, 'error');
      } finally {
        setMemberActionId(null);
      }
    },
    [isStaffAdmin, selectedTeamId, adminFetch, addToast, t, reloadTeam, confirm]
  );

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
      setIsJoinable((data.team as any).is_joinable ?? false);
    }
  }, [data?.team]);

  const canEdit = isStaffAdmin || data?.isCaptain || data?.isManager;

  // Valeurs dérivées mémoïsées : évitent de recalculer la liste et le décompte
  // de remplaçants à chaque frappe/tick (recherche joueur, formulaire, etc.).
  const members = useMemo(() => data?.members ?? [], [data?.members]);
  const membersCount = members.length;
  const subsCount = useMemo(
    () => members.filter((m) => m.is_substitute).length,
    [members]
  );

  const renderMembers = () => {
    if (!data?.team) return null;
    if (!members.length) {
      return (
        <div className="text-center py-8 text-neutral-400">
          <svg
            className="w-10 h-10 mx-auto mb-3 text-neutral-600"
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
          {t.noMembers}
        </div>
      );
    }

    const swapMode = swapSourceId !== null;

    return (
      <div className="space-y-2">
        {members.map((m) => (
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
            onStartEditBattleTag={startEditBattleTag}
            onBattleTagDraftChange={setBattleTagDraft}
            onSaveBattleTag={saveBattleTag}
            onCancelEditBattleTag={cancelEditBattleTag}
            onToggleSubstitute={toggleSubstitute}
            onStartSwap={startSwap}
            onCancelSwap={cancelSwap}
            onSwapWith={handleSwapWith}
            onTransferCaptain={handleTransferCaptain}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
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
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {data?.team ? data.team.name : t.headingFallback}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {isStaffAdmin
                    ? t.subtitleAdmin
                    : data?.isCaptain
                      ? t.subtitleCaptain
                      : data?.isManager
                        ? t.subtitleManager
                        : t.subtitleReadonly}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  isStaffAdmin && selectedTeamId ? load(selectedTeamId) : load()
                }
                className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors flex items-center gap-2"
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {t.refresh}
              </button>
            </div>
          </div>

          {/* Admin Team Selector */}
          {isStaffAdmin && (
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[250px]">
                  <label className="block text-sm text-neutral-400 mb-1">
                    {t.selectTeamToManage}
                  </label>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={loadingAllTeams}
                  >
                    <option value="">
                      {loadingAllTeams ? t.loading : t.chooseTeamPlaceholder}
                    </option>
                    {allTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                        {team.short_name ? ` (${team.short_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTeamId && (
                  <button
                    type="button"
                    onClick={() => {
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
                    className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
                  >
                    {t.reset}
                  </button>
                )}
              </div>

              <p className="text-xs text-neutral-500 mt-3">{t.adminHint}</p>
            </section>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
              <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="space-y-2">
                  <p>{error}</p>
                  {!isStaffAdmin && (
                    <button
                      type="button"
                      onClick={() => router.push('/admin/teams/new')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors"
                    >
                      {t.createMyTeam}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* No team selected (admin) or no team found (captain) */}
          {!loading && !error && !data?.team && (
            <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-8 text-center">
              <svg
                className="w-12 h-12 mx-auto mb-4 text-neutral-600"
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
              <p className="text-neutral-400">
                {isStaffAdmin ? t.selectTeamHint : t.noCaptainTeam}
              </p>
            </div>
          )}

          {/* Team content */}
          {!loading && !error && data?.team && (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              {/* Team Info */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-4">
                  {data.team.logo_url ? (
                    <Image
                      src={data.team.logo_url}
                      alt={data.team.name}
                      width={64}
                      height={64}
                      className="w-16 h-16 rounded-xl object-cover border border-neutral-700"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                      <svg
                        className="w-8 h-8 text-neutral-500"
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
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-semibold">{t.teamInfoTitle}</h2>
                    {!canEdit && (
                      <p className="text-xs text-neutral-500">{t.readonly}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.nameLabel}
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      disabled={!canEdit}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.shortNameLabel}
                      </label>
                      <input
                        value={form.short_name}
                        onChange={(e) =>
                          updateField('short_name', e.target.value)
                        }
                        disabled={!canEdit}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.countryLabel}
                      </label>
                      <input
                        value={form.country}
                        onChange={(e) => updateField('country', e.target.value)}
                        disabled={!canEdit}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.logoUrlLabel}
                    </label>
                    <input
                      value={form.logo_url}
                      onChange={(e) => updateField('logo_url', e.target.value)}
                      disabled={!canEdit}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.bioLabel}
                    </label>
                    <textarea
                      value={form.bio}
                      onChange={(e) => updateField('bio', e.target.value)}
                      disabled={!canEdit}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.descriptionLabel}
                    </label>
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        updateField('description', e.target.value)
                      }
                      disabled={!canEdit}
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center justify-between rounded-xl bg-neutral-900/50 border border-neutral-600 px-4 py-3">
                    <div>
                      <p className="text-sm text-neutral-200 font-medium">
                        {t.recruitmentOpen}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {isJoinable ? t.recruitmentOn : t.recruitmentOff}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleJoinable}
                      disabled={togglingJoinable}
                      className={`relative w-12 h-7 rounded-full transition-colors ${
                        isJoinable ? 'bg-emerald-600' : 'bg-neutral-600'
                      } ${togglingJoinable ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                          isJoinable ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                  </div>
                )}

                {canEdit && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                  </div>
                )}
              </section>

              {/* Members */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{t.members}</h2>
                    <p className="text-xs text-neutral-500">
                      {format(
                        membersCount > 1
                          ? t.memberCount_other
                          : t.memberCount_one,
                        { count: membersCount }
                      )}
                      {subsCount > 0 ? (
                        <span data-testid="substitute-count">
                          {format(
                            subsCount > 1 ? t.subCount_other : t.subCount_one,
                            { count: subsCount }
                          )}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowAddModal(true)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                      {t.add}
                    </button>
                  )}
                </div>

                {renderMembers()}
              </section>

              {/* Join Requests */}
              {canEdit && (joinRequests.length > 0 || joinRequestsLoading) && (
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-5 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {t.joinRequestsTitle}
                      </h2>
                      <p className="text-xs text-neutral-500">
                        {format(
                          joinRequests.length > 1
                            ? t.joinRequestCount_other
                            : t.joinRequestCount_one,
                          { count: joinRequests.length }
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={loadJoinRequests}
                      disabled={joinRequestsLoading}
                      className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs transition-colors"
                    >
                      {joinRequestsLoading ? t.loading : t.refresh}
                    </button>
                  </div>

                  {joinRequestsLoading && joinRequests.length === 0 ? (
                    <div className="flex items-center gap-2 text-neutral-400 text-sm py-4">
                      <div className="w-4 h-4 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                      {t.loadingRequests}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {joinRequests.map((jr) => {
                        const isProcessing = processingRequestId === jr.id;
                        const displayName =
                          jr.user?.display_name ||
                          jr.payload?.user_display_name ||
                          t.unknownPlayer;
                        const battleTag =
                          jr.user?.battle_tag ||
                          jr.payload?.user_battle_tag ||
                          null;
                        const desiredRole =
                          jr.payload?.desired_role || 'player';
                        const roleLabel =
                          desiredRole === 'substitute'
                            ? t.roleSubstitute
                            : t.rolePlayer;

                        return (
                          <div
                            key={jr.id}
                            className="p-4 rounded-xl bg-neutral-900/50 border border-neutral-700/50"
                          >
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-white">
                                    {displayName}
                                  </span>
                                  <span className="text-[10px] uppercase tracking-wide bg-blue-500/20 text-blue-300 rounded-lg px-2 py-0.5 border border-blue-500/30 font-semibold">
                                    {roleLabel}
                                  </span>
                                </div>
                                {battleTag && (
                                  <p className="text-xs text-blue-400 mt-0.5">
                                    {battleTag}
                                  </p>
                                )}
                                {jr.user?.email && (
                                  <p className="text-xs text-neutral-500 mt-0.5">
                                    {jr.user.email}
                                  </p>
                                )}
                                {jr.comment && (
                                  <p className="text-sm text-neutral-300 mt-2 bg-neutral-800/50 rounded-lg px-3 py-2 border border-neutral-700/30">
                                    &laquo; {jr.comment} &raquo;
                                  </p>
                                )}
                                <p className="text-[11px] text-neutral-500 mt-1">
                                  {new Date(jr.created_at).toLocaleDateString(
                                    'fr-FR',
                                    {
                                      day: 'numeric',
                                      month: 'long',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )}
                                </p>
                              </div>

                              <div className="flex gap-2 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleJoinRequestAction(jr.id, 'approve')
                                  }
                                  disabled={isProcessing}
                                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                >
                                  {isProcessing ? (
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  ) : (
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
                                  )}
                                  {t.accept}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleJoinRequestAction(jr.id, 'reject')
                                  }
                                  disabled={isProcessing}
                                  className="px-4 py-2 rounded-xl bg-red-600/80 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
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
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                  {t.reject}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {dialog}

      {/* Add Member Modal */}
      <Modal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setSelectedPlayer(null);
          setSearchQuery('');
          setSearchResults([]);
          setNewMemberBattleTag('');
          setNewMemberRole('player');
        }}
        size="lg"
        backdropClassName="bg-black/70 backdrop-blur-sm"
        panelClassName="max-h-[90vh] overflow-hidden"
        title={t.addMemberModalTitle}
        footer={
          selectedPlayer ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedPlayer(null);
                  setSearchQuery('');
                  setSearchResults([]);
                  setNewMemberBattleTag('');
                  setNewMemberRole('player');
                }}
                className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleAddMember}
                disabled={addingMember || !newMemberBattleTag}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addingMember ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t.adding}
                  </>
                ) : (
                  t.add
                )}
              </button>
            </>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {!selectedPlayer ? (
            <>
              {/* Search input */}
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.searchLabel}
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
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
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="email@example.com ou Pseudo#1234"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    autoFocus
                  />
                </div>
              </div>

              {/* Search results */}
              <PlayerSearchResults
                results={searchResults}
                searchLoading={searchLoading}
                searchQuery={searchQuery}
                onSelect={handleSelectPlayer}
              />
            </>
          ) : (
            <>
              {/* Selected player form */}
              <div className="bg-neutral-900/50 rounded-xl p-4 border border-blue-500/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">
                      {selectedPlayer.display_name ||
                        selectedPlayer.email ||
                        t.userFallback}
                    </div>
                    {selectedPlayer.email && (
                      <div className="text-xs text-neutral-400">
                        {selectedPlayer.email}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedPlayer(null)}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {t.change}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-neutral-300 mb-1">
                  {t.battleTagLabel}{' '}
                  {roleRequiresBattleTag(newMemberRole) && (
                    <span className="text-red-400">*</span>
                  )}
                </label>
                <input
                  type="text"
                  value={newMemberBattleTag}
                  onChange={(e) => setNewMemberBattleTag(e.target.value)}
                  placeholder={t.battleTagPlaceholder}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  {t.battleTagHelp}
                </p>
              </div>

              <div>
                <label className="block text-sm text-neutral-300 mb-1">
                  {t.roleLabel}
                </label>
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="player">{t.roleOptionPlayer}</option>
                  <option value="tank">{t.roleOptionTank}</option>
                  <option value="dps">{t.roleOptionDps}</option>
                  <option value="support">{t.roleOptionSupport}</option>
                  <option value="flex">{t.roleOptionFlex}</option>
                  <option value="coach">{t.roleOptionCoach}</option>
                  <option value="manager">{t.roleOptionManager}</option>
                </select>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

export default MyTeamPage;
