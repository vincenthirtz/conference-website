// features/admin/teams/hooks/useTeamEditMemberActions.ts — les actions de
// membre de la fiche équipe (pages/admin/teams/[teamId]/edit.tsx) : modales
// d'ajout / d'édition, recherche joueur (debounce + annulation), suppression,
// capitanat, échange roster ↔ remplaçante.
//
// Corps DÉPLACÉS À L'IDENTIQUE depuis la page (lot 9B) : seuls les accès à
// l'état et aux outils de la page deviennent des paramètres. La page reste
// propriétaire de tous les useState / useRef ; les tableaux de dépendances
// d'origine sont conservés tels quels.

import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import {
  addMemberSuccessToast,
  buildAddMemberBody,
  validateAddMemberForm,
} from '@/components/admin/teams/staffAddMember';
import type {
  MemberFormState,
  SearchResult,
} from '@/components/admin/teams/types';
import type { TeamRow, TeamMemberRow } from '@/types/admin';
import { teamsClient, teamsPaths } from '../client';
import type {
  AddToast,
  Confirm,
  Dict,
  Mutate,
  Setter,
} from './teamEditHookTypes';

export type UseTeamEditMemberActionsDeps = {
  t: Dict;
  teamId: string | undefined;
  memberForm: MemberFormState;
  editingMember: TeamMemberRow | null;
  swapSource: TeamMemberRow | null;
  addMemberMutate: Mutate;
  addToast: AddToast;
  confirm: Confirm;
  fetchMembers: () => Promise<void>;
  fetchTeam: () => Promise<void>;
  searchDebounceRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  searchAbortRef: MutableRefObject<AbortController | null>;
  setMemberForm: Setter<MemberFormState>;
  setMemberError: Setter<string | null>;
  setMemberSaving: Setter<boolean>;
  setSearchQuery: Setter<string>;
  setSearchResults: Setter<SearchResult[]>;
  setSearchLoading: Setter<boolean>;
  setShowSearchResults: Setter<boolean>;
  setShowAddMemberModal: Setter<boolean>;
  setShowEditMemberModal: Setter<boolean>;
  setEditingMember: Setter<TeamMemberRow | null>;
  /** Pose l'équipe renvoyée par le PATCH (cache + listes). */
  setTeam: (team: TeamRow) => void;
  setErrorMsg: Setter<string | null>;
  setSwapSource: Setter<TeamMemberRow | null>;
};

export function useTeamEditMemberActions(deps: UseTeamEditMemberActionsDeps) {
  const {
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
  } = deps;

  // Member handlers
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
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

  // La recherche joueur tape une API coûteuse (listUsers + jointures + N
  // getUserById). On débounce la frappe et on annule la requête précédente pour
  // ne lancer qu'un fetch par pause de saisie, et ignorer les réponses périmées.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const runSearch = useCallback(async (query: string) => {
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);
    setShowSearchResults(true);
    try {
      const json = await teamsClient.searchUsers(query, controller.signal);
      if (json.players) {
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
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
      const res = await addMemberMutate(teamsPaths.members(teamId), {
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const handleEditMember = useCallback(async () => {
    if (!teamId || !editingMember) return;

    setMemberSaving(true);
    setMemberError(null);

    try {
      await teamsClient.updateMember(teamId, {
        memberId: editingMember.id,
        role: memberForm.role.trim() || 'player',
        battleTag: memberForm.battleTag.trim() || null,
        // Chaîne vide = effacer le poste (validateSpecialty la rend null).
        specialty: memberForm.specialty,
        // Champ vide = effacer, pas « ne rien changer » : c'est la seule
        // façon de retirer un SR devenu faux depuis l'écran staff.
        skillRating: memberForm.skillRating.trim() || null,
        isSubstitute: memberForm.isSubstitute,
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
  }, [teamId, editingMember, memberForm, addToast, fetchMembers, t]);

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
        await teamsClient.removeMember(teamId, member.id);
        addToast(t.toastMemberRemoved, 'success');
        await fetchMembers();
        await fetchTeam();
      } catch {
        // Silently fail
      }
    },
    [teamId, addToast, fetchMembers, fetchTeam, confirm, t]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
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
        const json = await teamsClient.update(teamId, {
          captain_id: member.user_id,
        });

        setTeam(json.team);
        addToast(t.toastCaptainSet, 'success');
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message ?? t.errUnexpected);
      }
    },
    [teamId, addToast, confirm, t]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const handleSwap = useCallback(
    async (memberA: TeamMemberRow, memberB: TeamMemberRow) => {
      if (!teamId) return;

      try {
        await teamsClient.updateMember(teamId, {
          memberId: memberA.id,
          swapWithMemberId: memberB.id,
        });

        setSwapSource(null);
        addToast(t.toastSwapDone, 'success');
        await fetchMembers();
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message ?? t.errUnexpected);
      }
    },
    [teamId, addToast, fetchMembers, t]
  );

  // Amorce d'un échange depuis une ligne (bouton "Échanger").
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const handleStartSwap = useCallback((member: TeamMemberRow) => {
    setSwapSource(member);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const handleCancelSwap = useCallback(() => setSwapSource(null), []);

  // Cible d'échange cliquée : échange avec la source courante.
  const handleSwapWithSource = useCallback(
    (member: TeamMemberRow) => {
      if (swapSource) handleSwap(swapSource, member);
    },
    [swapSource, handleSwap]
  );

  return {
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
  };
}
