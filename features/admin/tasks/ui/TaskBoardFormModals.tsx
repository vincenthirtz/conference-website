// features/admin/tasks/ui/TaskBoardFormModals.tsx — modales de formulaire du
// tableau de tâches : board (création / renommage), colonne (ajout /
// édition) et suppression d'une colonne non vide (déplacer ses cartes).
// Présentationnelles : la page et ses hooks gardent les valeurs saisies,
// l'état d'enregistrement et les appels ; ici, les valeurs et les gestes.

import Modal from '@/components/admin/Modal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { format } from '@/lib/i18n/useAdminT';
import type {
  BoardDetailColumn,
  Dict,
} from '@/components/admin/tasks/taskBoardModel';
import {
  TB_CHECKBOX,
  TB_FIELD,
  TB_LABEL,
  TB_PANEL,
  TB_TITLE,
} from './taskBoardClasses';

export function TaskBoardBoardModal({
  t,
  open,
  mode,
  name,
  description,
  saving,
  onNameChange,
  onDescriptionChange,
  onClose,
  onSave,
}: {
  t: Dict;
  open: boolean;
  mode: 'create' | 'rename';
  name: string;
  description: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <h2 className={TB_TITLE}>
          {mode === 'create' ? t.createBoardTitle : t.renameBoardTitle}
        </h2>
      }
      size="lg"
      panelChromeClassName={TB_PANEL}
      footer={
        <>
          <AdminButton size="sm" onClick={onClose}>
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={saving}
          >
            {saving
              ? mode === 'create'
                ? t.creating
                : t.saving
              : mode === 'create'
                ? t.create
                : t.save}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="board-name" className={TB_LABEL}>
            {t.boardNameLabel}
          </label>
          <input
            id="board-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className={TB_FIELD}
            placeholder={t.boardNamePlaceholder}
          />
        </div>
        <div>
          <label htmlFor="board-desc" className={TB_LABEL}>
            {t.boardDescLabel}
          </label>
          <textarea
            id="board-desc"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={3}
            className={TB_FIELD}
            placeholder={t.boardDescPlaceholder}
          />
        </div>
      </div>
    </Modal>
  );
}

export function TaskBoardColumnModal({
  t,
  open,
  editing,
  name,
  wip,
  isDone,
  saving,
  onNameChange,
  onWipChange,
  onIsDoneChange,
  onClose,
  onSave,
}: {
  t: Dict;
  open: boolean;
  /** Vrai en édition d'une colonne existante. */
  editing: boolean;
  name: string;
  wip: string;
  isDone: boolean;
  saving: boolean;
  onNameChange: (value: string) => void;
  onWipChange: (value: string) => void;
  onIsDoneChange: (value: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <h2 className={TB_TITLE}>
          {editing ? t.editColumnTitle : t.addColumnTitle}
        </h2>
      }
      size="lg"
      panelChromeClassName={TB_PANEL}
      footer={
        <>
          <AdminButton size="sm" onClick={onClose}>
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? t.saving : t.save}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="col-name" className={TB_LABEL}>
            {t.columnNameLabel}
          </label>
          <input
            id="col-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className={TB_FIELD}
            placeholder={t.columnNamePlaceholder}
          />
        </div>
        <div>
          <label htmlFor="col-wip" className={TB_LABEL}>
            {t.wipLimitLabel}
          </label>
          <input
            id="col-wip"
            type="number"
            min={1}
            value={wip}
            onChange={(e) => onWipChange(e.target.value)}
            className={TB_FIELD}
          />
          <p className="mt-1 text-xs text-[var(--t4,#807984)]">
            {t.wipLimitHint}
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
          <input
            type="checkbox"
            checked={isDone}
            onChange={(e) => onIsDoneChange(e.target.checked)}
            className={TB_CHECKBOX}
          />
          {t.isDoneLabel}
        </label>
      </div>
    </Modal>
  );
}

/**
 * Suppression d'une colonne qui contient encore des cartes : on choisit la
 * colonne qui les reçoit (ajoutées à la fin, limite WIP ignorée), puis l'API
 * déplace et supprime en un geste (`DELETE /columns/{id}?moveTo=`).
 */
export function TaskBoardDeleteColumnModal({
  t,
  column,
  targets,
  moveToColumnId,
  deleting,
  onMoveToChange,
  onConfirm,
  onClose,
}: {
  t: Dict;
  /** Colonne à supprimer ; `null` = fenêtre fermée. */
  column: BoardDetailColumn | null;
  /** Autres colonnes du board, dans l'ordre d'affichage. */
  targets: BoardDetailColumn[];
  moveToColumnId: string;
  deleting: boolean;
  onMoveToChange: (columnId: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const count = column ? column.tasks.length + (column.archivedCount ?? 0) : 0;
  return (
    <Modal
      open={!!column}
      onClose={onClose}
      title={
        <h2 className={TB_TITLE}>
          {format(t.deleteColumnMoveTitle, { name: column?.name ?? '' })}
        </h2>
      }
      size="lg"
      panelChromeClassName={TB_PANEL}
      footer={
        <>
          <AdminButton size="sm" onClick={onClose}>
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="danger"
            size="sm"
            onClick={onConfirm}
            disabled={deleting || !moveToColumnId || targets.length === 0}
          >
            {deleting ? t.deleting : t.deleteColumnMoveConfirm}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--t2,#c7bfca)]">
          {format(t.deleteColumnMoveIntro, { count })}
        </p>
        {targets.length === 0 ? (
          <p className="text-sm text-[var(--warn,#f5a524)]">
            {t.deleteColumnNoTarget}
          </p>
        ) : (
          <div>
            <label htmlFor="col-move-to" className={TB_LABEL}>
              {t.deleteColumnMoveTarget}
            </label>
            <select
              id="col-move-to"
              value={moveToColumnId}
              onChange={(e) => onMoveToChange(e.target.value)}
              className={TB_FIELD}
            >
              {targets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}
