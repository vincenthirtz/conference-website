// features/admin/tasks/ui/TaskBoardBoardBar.tsx — sélecteur de board (onglets
// + « afficher les archivés ») et barre d'actions du board actif. Les gestes
// (renommer, archiver, supprimer, labels, corbeille, colonne) viennent de la
// page ; rien ici n'écrit sur le réseau.

import Tabs from '@/components/ui/Tabs';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import type {
  BoardListItem,
  Dict,
} from '@/components/admin/tasks/taskBoardModel';
import { TB_CHECKBOX } from './taskBoardClasses';

export function TaskBoardTabs({
  t,
  boards,
  activeBoardId,
  onSelect,
  showArchived,
  onShowArchivedChange,
}: {
  t: Dict;
  boards: BoardListItem[];
  activeBoardId: string | null;
  onSelect: (id: string) => void;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Tabs
        tabs={boards.map((b) => ({
          id: b.id,
          label: b.isArchived ? (
            <span className="inline-flex items-center gap-2">
              {b.name}
              <Chip tone="warn">{t.archivedBadge}</Chip>
            </span>
          ) : (
            b.name
          ),
        }))}
        active={activeBoardId ?? ''}
        onChange={(id) => onSelect(id)}
        ariaLabel={t.boardTabsLabel}
        idBase="tasks-board"
      />
      <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--t3,#a39ba6)]">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => onShowArchivedChange(e.target.checked)}
          className={TB_CHECKBOX}
        />
        {t.showArchived}
      </label>
    </div>
  );
}

export function TaskBoardActions({
  t,
  activeBoard,
  onRename,
  onToggleArchive,
  onDelete,
  onManageLabels,
  onOpenTrash,
  onAddColumn,
}: {
  t: Dict;
  activeBoard: BoardListItem;
  onRename: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
  onManageLabels: () => void;
  onOpenTrash: () => void;
  onAddColumn: () => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <AdminButton variant="ghost" size="sm" onClick={onRename}>
        {t.renameBoard}
      </AdminButton>
      <AdminButton variant="ghost" size="sm" onClick={onToggleArchive}>
        {activeBoard.isArchived ? t.unarchiveBoard : t.archiveBoard}
      </AdminButton>
      <AdminButton variant="danger" size="sm" onClick={onDelete}>
        {t.deleteBoard}
      </AdminButton>
      <AdminButton
        variant="ghost"
        size="sm"
        className="ml-auto"
        onClick={onManageLabels}
      >
        {t.manageLabels}
      </AdminButton>
      <AdminButton variant="ghost" size="sm" onClick={onOpenTrash}>
        {t.trashButton}
      </AdminButton>
      <AdminButton variant="secondary" size="sm" onClick={onAddColumn}>
        {t.addColumn}
      </AdminButton>
    </div>
  );
}
