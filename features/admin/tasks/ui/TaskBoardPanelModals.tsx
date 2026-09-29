// features/admin/tasks/ui/TaskBoardPanelModals.tsx — modales de gestion du
// board actif : labels (création avec aperçu, liste éditable) et corbeille
// (cartes supprimées, restauration). Présentationnelles : la page garde l'état
// et les appels, elle passe ici les valeurs et les gestes.

import Modal from '@/components/admin/Modal';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  type BoardLabel,
  type DeletedTask,
  type Dict,
  formatCommentDate,
  priorityLabel,
  priorityTone,
} from '@/components/admin/tasks/taskBoardModel';
import {
  LabelManagerRow,
  LabelPill,
} from '@/components/admin/tasks/TaskBoardParts';
import {
  TB_FIELD_SM,
  TB_PANEL,
  TB_SURFACE,
  TB_TITLE,
} from './taskBoardClasses';

export function TaskBoardLabelsModal({
  t,
  open,
  labels,
  newName,
  newColor,
  busy,
  onNewNameChange,
  onNewColorChange,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: {
  t: Dict;
  open: boolean;
  labels: BoardLabel[];
  newName: string;
  newColor: string;
  busy: boolean;
  onNewNameChange: (value: string) => void;
  onNewColorChange: (value: string) => void;
  onCreate: () => void;
  onUpdate: (id: string, patch: { name?: string; color?: string }) => void;
  onDelete: (label: BoardLabel) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<h2 className={TB_TITLE}>{t.labelsPanelTitle}</h2>}
      size="lg"
      panelChromeClassName={TB_PANEL}
      footer={
        <AdminButton size="sm" onClick={onClose}>
          {t.cancel}
        </AdminButton>
      }
    >
      <div className="space-y-4">
        {/* Creation d'un label */}
        <div className={`p-3 ${TB_SURFACE}`}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <label
                htmlFor="new-label-name"
                className="mb-1 block text-xs text-[var(--t3,#a39ba6)]"
              >
                {t.labelNameField}
              </label>
              <input
                id="new-label-name"
                type="text"
                value={newName}
                maxLength={40}
                onChange={(e) => onNewNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onCreate();
                  }
                }}
                className={`w-full ${TB_FIELD_SM}`}
              />
            </div>
            <div>
              <label
                htmlFor="new-label-color"
                className="mb-1 block text-xs text-[var(--t3,#a39ba6)]"
              >
                {t.labelColorField}
              </label>
              <input
                id="new-label-color"
                type="color"
                value={newColor}
                onChange={(e) => onNewColorChange(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-transparent"
              />
            </div>
            <AdminButton
              variant="primary"
              size="sm"
              onClick={() => void onCreate()}
              disabled={busy || !newName.trim()}
            >
              {t.labelCreateButton}
            </AdminButton>
          </div>
          {newName.trim() && (
            <div className="mt-2">
              <LabelPill
                name={newName.trim()}
                def={{
                  id: 'preview',
                  name: newName.trim(),
                  color: newColor,
                  position: 0,
                }}
              />
            </div>
          )}
        </div>

        {/* Liste des labels existants */}
        {labels.length === 0 ? (
          <p className="text-sm text-[var(--t4,#807984)]">
            {t.labelsPanelEmpty}
          </p>
        ) : (
          <ul className="space-y-2">
            {labels.map((l) => (
              <LabelManagerRow
                key={l.id}
                t={t}
                label={l}
                busy={busy}
                onSave={(patch) => onUpdate(l.id, patch)}
                onDelete={() => onDelete(l)}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export function TaskBoardTrashModal({
  t,
  open,
  loading,
  tasks,
  restoringId,
  onRestore,
  onClose,
}: {
  t: Dict;
  open: boolean;
  loading: boolean;
  tasks: DeletedTask[];
  restoringId: string | null;
  onRestore: (task: DeletedTask) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<h2 className={TB_TITLE}>{t.trashTitle}</h2>}
      size="lg"
      panelChromeClassName={TB_PANEL}
      footer={
        <AdminButton size="sm" onClick={onClose}>
          {t.cancel}
        </AdminButton>
      }
    >
      {loading ? (
        <p className="text-sm text-[var(--t4,#807984)]">{t.loading}</p>
      ) : tasks.length === 0 ? (
        <div className={`p-8 text-center ${TB_SURFACE}`}>
          <p className="text-sm text-[var(--t2,#c7bfca)]">{t.trashEmpty}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className={`flex items-start gap-3 p-3 ${TB_SURFACE}`}
            >
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium leading-snug text-[var(--t1,#f4edf7)]">
                  {task.title}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--t3,#a39ba6)]">
                  {task.columnName && <Chip>{task.columnName}</Chip>}
                  <Chip tone={priorityTone(task.priority)}>
                    {priorityLabel(t, task.priority)}
                  </Chip>
                  {task.dueDate && (
                    <span className="text-[var(--t2,#c7bfca)]" data-numeric>
                      {task.dueDate.slice(0, 10)}
                    </span>
                  )}
                  <span className="text-[var(--t4,#807984)]">
                    {format(t.trashDeletedAt, {
                      value: formatCommentDate(task.deletedAt),
                    })}
                  </span>
                </div>
              </div>
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() => void onRestore(task)}
                disabled={restoringId === task.id}
              >
                {restoringId === task.id ? t.trashRestoring : t.trashRestore}
              </AdminButton>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
