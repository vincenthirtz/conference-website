// features/admin/teams/hooks/useMyTeamMemberActions.ts — les actions de roster
// de l'espace « mon équipe » (pages/admin/teams/my.tsx) : BattleTag inline,
// niveau déclaré (SR), titulaire/remplaçante, échange, transfert du capitanat.
//
// Sortie telle quelle de la page (gelée en taille, lot 7C) : mêmes états, mêmes
// appels, mêmes payloads. La page lui passe ce dont les handlers dépendaient
// dans sa closure (droits, fetch, toast, recharge, portée d'équipe).

import { useCallback, useState } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type { useAdminFetch } from '@/hooks/useAdminFetch';
import type { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { useToast } from '@/components/Toast';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';
import { isValidSkillRating } from '@/utils/overwatchRank';
import { logger } from '@/utils/logger';
import type { Member } from '@/components/admin/teams/my/types';
import type nsAdminTeamsMy from '@/lib/i18n/locales/admin-fr/adminTeamsMy';

type Deps = {
  isStaffAdmin: boolean;
  selectedTeamId: string;
  /** `data?.members` de la page (source de l'échange). */
  members: Member[] | undefined;
  adminFetch: ReturnType<typeof useAdminFetch>['adminFetch'];
  addToast: ReturnType<typeof useToast>['addToast'];
  confirm: ReturnType<typeof useConfirmDialog>['confirm'];
  t: (typeof nsAdminTeamsMy)['fr'];
  reloadTeam: () => Promise<void>;
  scopeToTeam: (url: string) => string;
};

export function useMyTeamMemberActions({
  isStaffAdmin,
  selectedTeamId,
  members,
  adminFetch,
  addToast,
  confirm,
  t,
  reloadTeam,
  scopeToTeam,
}: Deps) {
  // Inline member editing (BattleTag) + substitute / captain actions
  const [editingBattleTagId, setEditingBattleTagId] = useState<string | null>(
    null
  );
  const [battleTagDraft, setBattleTagDraft] = useState('');
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);

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
        // Les deux routes n'ont PAS le même contrat de corps : l'API admin
        // attend `battleTag` (camelCase), la route capitaine `battle_tag`.
        // Envoyer la seconde forme à la première ne produisait aucun champ à
        // mettre à jour — donc un « No fields to update » sur toute correction
        // faite par un admin depuis cet écran.
        const isAdminPath = Boolean(isStaffAdmin && selectedTeamId);
        const url = isAdminPath
          ? `/api/admin/teams/${selectedTeamId}/members`
          : '/api/teams/update-member';
        const res = await adminFetch(scopeToTeam(url), {
          method: 'PATCH',
          body: JSON.stringify(
            isAdminPath
              ? { memberId: m.id, battleTag: trimmed }
              : { memberId: m.id, battle_tag: trimmed }
          ),
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
      scopeToTeam,
    ]
  );

  // --- Member: niveau Overwatch déclaré (SR) ------------------------------
  // Brouillons par ligne : le champ est libre (0-5000), donc on n'enregistre
  // pas à chaque frappe. La valeur part au blur ou à Entrée, et le brouillon
  // est oublié ensuite pour que la ligne reparte de ce que le serveur a retenu.
  const [skillRatingDrafts, setSkillRatingDrafts] = useState<
    Record<string, string>
  >({});

  const handleSkillRatingDraftChange = useCallback(
    (memberId: string, value: string) => {
      setSkillRatingDrafts((prev) => ({ ...prev, [memberId]: value }));
    },
    []
  );

  const clearSkillRatingDraft = useCallback((memberId: string) => {
    setSkillRatingDrafts((prev) => {
      const { [memberId]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const saveSkillRating = useCallback(
    async (m: Member, raw: string) => {
      const trimmed = raw.trim();
      const current = m.skill_rating ?? null;
      const next = trimmed === '' ? null : Number(trimmed);

      // Rien de neuf : on referme le brouillon sans déranger le serveur.
      if (next === current) {
        clearSkillRatingDraft(m.id);
        return;
      }
      if (next !== null && !isValidSkillRating(next)) {
        addToast(t.errSkillRatingInvalid, 'error');
        return;
      }

      setMemberActionId(m.id);
      try {
        // Même divergence de contrat que le BattleTag : `skillRating` côté
        // admin, `skill_rating` côté capitaine.
        const isAdminPath = Boolean(isStaffAdmin && selectedTeamId);
        const url = isAdminPath
          ? `/api/admin/teams/${selectedTeamId}/members`
          : '/api/teams/update-member';
        const res = await adminFetch(scopeToTeam(url), {
          method: 'PATCH',
          body: JSON.stringify(
            isAdminPath
              ? { memberId: m.id, skillRating: next }
              : { memberId: m.id, skill_rating: next }
          ),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          addToast(json?.error || t.errUpdate, 'error');
          return;
        }
        clearSkillRatingDraft(m.id);
        addToast(t.skillRatingUpdated, 'success');
        await reloadTeam();
      } catch (err) {
        logger.error('saveSkillRating error', err);
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
      scopeToTeam,
      clearSkillRatingDraft,
    ]
  );

  // --- Member: substitute toggle ------------------------------------------
  const toggleSubstitute = useCallback(
    async (m: Member) => {
      const next = !(m.is_substitute ?? false);
      setMemberActionId(m.id);
      try {
        // Même divergence de contrat que pour le BattleTag ci-dessus :
        // `isSubstitute` côté admin, `is_substitute` côté capitaine.
        const isAdminPath = Boolean(isStaffAdmin && selectedTeamId);
        const url = isAdminPath
          ? `/api/admin/teams/${selectedTeamId}/members`
          : '/api/teams/update-member';
        const res = await adminFetch(url, {
          method: 'PATCH',
          body: JSON.stringify(
            isAdminPath
              ? { memberId: m.id, isSubstitute: next }
              : { memberId: m.id, is_substitute: next }
          ),
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
      const source = members?.find((m) => m.id === swapSourceId);
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
            adminFetch(scopeToTeam('/api/teams/update-member'), {
              method: 'PATCH',
              body: JSON.stringify({
                memberId: source.id,
                is_substitute: !(source.is_substitute ?? false),
              }),
            }),
            adminFetch(scopeToTeam('/api/teams/update-member'), {
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
      members,
      isStaffAdmin,
      selectedTeamId,
      adminFetch,
      addToast,
      t,
      reloadTeam,
      scopeToTeam,
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
          const res = await adminFetch(
            scopeToTeam('/api/teams/transfer-captain'),
            {
              method: 'PATCH',
              body: JSON.stringify({ newCaptainUserId: m.user_id }),
            }
          );
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
    [
      isStaffAdmin,
      selectedTeamId,
      adminFetch,
      addToast,
      t,
      reloadTeam,
      confirm,
      scopeToTeam,
    ]
  );

  return {
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
  };
}
