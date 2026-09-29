// features/admin/tasks/ui/TaskBoardHeader.tsx — en-tête du tableau de tâches
// (« Le Ruban ») : titre, sous-titre, bascule Board ↔ Mes tâches, rafraîchir
// et création de board. Présentationnel : la page fournit les gestes.

import Tabs from '@/components/ui/Tabs';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import type { Dict } from '@/components/admin/tasks/taskBoardModel';

export default function TaskBoardHeader({
  t,
  viewMode,
  onViewModeChange,
  onRefresh,
  onCreateBoard,
}: {
  t: Dict;
  viewMode: 'board' | 'mine';
  onViewModeChange: (mode: 'board' | 'mine') => void;
  onRefresh: () => void;
  onCreateBoard: () => void;
}) {
  return (
    <AdminPageHeader
      title={t.pageTitle}
      subtitle={t.subtitle}
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Bascule Board / Mes taches : la primitive partagee (tablist + fleches + focus roving). */}
          <Tabs
            tabs={[
              { id: 'board', label: t.viewBoard },
              { id: 'mine', label: t.viewMyTasks },
            ]}
            active={viewMode}
            onChange={(id) => onViewModeChange(id as 'board' | 'mine')}
            ariaLabel={t.viewMyTasks}
            idBase="tasks-view"
            variant="segmented"
          />
          <AdminButton variant="ghost" size="sm" onClick={onRefresh}>
            {t.refresh}
          </AdminButton>
          {viewMode === 'board' && (
            <AdminButton variant="primary" size="sm" onClick={onCreateBoard}>
              {t.newBoard}
            </AdminButton>
          )}
        </div>
      }
    />
  );
}
