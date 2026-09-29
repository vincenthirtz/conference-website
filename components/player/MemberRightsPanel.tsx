// components/player/MemberRightsPanel.tsx
//
// Délégation de droits dans l'équipe (lot J3) — conteneur : lit les droits
// sur le cache joueuse (portée sujet + équipe active) et poste la bascule ;
// le rendu est `MemberRightsList` (features/player/team/ui). La règle « on ne
// délègue pas ce qu'on n'a pas » vit dans le service, pas ici (lot P10).

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import nsManageTeam from '@/lib/i18n/locales/fr/manageTeam';
import type { TeamPermission } from '@/utils/teamRoles';
import {
  useMemberRights,
  useSetMemberRight,
} from '@/features/player/team/hooks/useTeamQueries';
import MemberRightsList from '@/features/player/team/ui/MemberRightsList';
import { logger } from '@/utils/logger';

export default function MemberRightsPanel({
  memberUserId,
}: {
  memberUserId: string;
}) {
  const t = useT(nsManageTeam);
  const { addToast } = useToast();
  const rights = useMemberRights();
  const setRight = useSetMemberRight();
  const [busy, setBusy] = useState<TeamPermission | null>(null);

  if (rights.isError) {
    return <p className="mt-2 text-xs text-red-300">{t.delegateLoadError}</p>;
  }
  if (!rights.data) return null;

  const toggle = async (permission: TeamPermission, grant: boolean) => {
    if (busy) return;
    setBusy(permission);
    try {
      await setRight.mutateAsync({ userId: memberUserId, permission, grant });
      addToast(t.delegateSaved, 'success');
    } catch (err) {
      logger.error('[member-rights] toggle error:', err);
      addToast(t.delegateError, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <MemberRightsList
      t={t}
      memberUserId={memberUserId}
      state={rights.data.members.find((m) => m.userId === memberUserId) ?? null}
      delegatable={rights.data.delegatable}
      busy={busy}
      onToggle={(permission, grant) => void toggle(permission, grant)}
    />
  );
}
