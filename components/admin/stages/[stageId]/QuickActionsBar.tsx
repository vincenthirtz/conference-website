// components/admin/stages/[stageId]/QuickActionsBar.tsx
import React from 'react';
import type { Stage } from '@/types/admin';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import type { Dict } from './stageDisplay';

type Props = {
  stage: Stage;
  matchesUrl: string | null;
  cloning: boolean;
  onEdit: () => void;
  onOpenAdvance: () => void;
  onClone: (includeMatches: boolean) => void;
  t: Dict;
};

/**
 * Barre d'actions rapides (éditer, matches, avancer, cloner, historique).
 * Ne reçoit que des callbacks STABLES (`useCallback` côté page) + des scalaires,
 * donc `React.memo` la fige tant qu'aucune action n'est en vol : une frappe dans
 * un formulaire/modale ne la re-rend plus.
 */
function QuickActionsBar({
  stage,
  matchesUrl,
  cloning,
  onEdit,
  onOpenAdvance,
  onClone,
  t,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <AdminButton variant="primary" size="sm" onClick={onOpenAdvance}>
        {t.advanceTeams}
      </AdminButton>
      <AdminButton variant="secondary" size="sm" onClick={onEdit}>
        {t.editStage}
      </AdminButton>
      {matchesUrl && (
        <AdminButtonLink href={matchesUrl} size="sm">
          {t.viewMatches}
        </AdminButtonLink>
      )}
      <AdminButton size="sm" onClick={() => onClone(false)} disabled={cloning}>
        {cloning ? t.cloning : t.cloneStage}
      </AdminButton>
      <AdminButton size="sm" onClick={() => onClone(true)} disabled={cloning}>
        {cloning ? t.cloning : t.cloneWithMatches}
      </AdminButton>
      <AdminButtonLink href={`/admin/stages/${stage.id}/history`} size="sm">
        {t.history}
      </AdminButtonLink>
    </div>
  );
}

export default React.memo(QuickActionsBar);
