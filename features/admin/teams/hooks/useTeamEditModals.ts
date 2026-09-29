// features/admin/teams/hooks/useTeamEditModals.ts — l'import de BattleTags
// (aperçu puis application via `/roster-bulk`) et l'ouverture / fermeture des
// modales de la fiche équipe (pages/admin/teams/[teamId]/edit.tsx).
//
// Corps DÉPLACÉS À L'IDENTIQUE depuis la page (lot 9B) : seuls les accès à
// l'état et aux outils de la page deviennent des paramètres. La page reste
// propriétaire de tous les useState / useRef ; les tableaux de dépendances
// d'origine sont conservés tels quels.

import { useCallback } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import { teamsClient } from '../client';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';
import type { ImportLine } from '@/components/admin/teams/types';
import type { TeamMemberRow } from '@/types/admin';
import type { AddToast, Dict, Setter } from './teamEditHookTypes';

const BATTLE_TAG_RE = BATTLE_TAG_REGEX;

export type UseTeamEditModalsDeps = {
  t: Dict;
  teamId: string | undefined;
  members: TeamMemberRow[];
  importText: string;
  setImportText: Setter<string>;
  importPreview: ImportLine[] | null;
  setImportPreview: Setter<ImportLine[] | null>;
  setImportBusy: Setter<boolean>;
  setShowImportModal: Setter<boolean>;
  setShowAddMemberModal: Setter<boolean>;
  setShowEditMemberModal: Setter<boolean>;
  setEditingMember: Setter<TeamMemberRow | null>;
  setErrorMsg: Setter<string | null>;
  addToast: AddToast;
  fetchMembers: () => Promise<void>;
};

export function useTeamEditModals(deps: UseTeamEditModalsDeps) {
  const {
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
  } = deps;

  // --- BattleTag import ---------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
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
      const json = await teamsClient.rosterBulk(teamId, {
        operation: 'import_battle_tags',
        items,
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
  }, [teamId, importPreview, addToast, fetchMembers, t]);

  // Ouverture / fermeture des modales (handlers stables pour les React.memo).
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const openImportModal = useCallback(() => {
    setImportText('');
    setImportPreview(null);
    setShowImportModal(true);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const closeImportModal = useCallback(() => setShowImportModal(false), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const handleImportTextChange = useCallback((value: string) => {
    setImportText(value);
    setImportPreview(null);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const closeAddMemberModal = useCallback(
    () => setShowAddMemberModal(false),
    []
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const closeEditMemberModal = useCallback(() => {
    setShowEditMemberModal(false);
    setEditingMember(null);
  }, []);

  return {
    buildImportPreview,
    applyImport,
    openImportModal,
    closeImportModal,
    handleImportTextChange,
    closeAddMemberModal,
    closeEditMemberModal,
  };
}
