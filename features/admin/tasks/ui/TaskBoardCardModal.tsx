// features/admin/tasks/ui/TaskBoardCardModal.tsx — modale de carte (création /
// édition) : titre, description, priorité, échéance, assignée, labels (retirer,
// ajouter depuis le board, créer à la volée). En édition, les sections
// checklist / commentaires / activité sont passées par la page en `children`.
// Présentationnelle : aucun appel, la page fournit valeurs et gestes.

import type { ReactNode } from 'react';
import Modal from '@/components/admin/Modal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  type BoardLabel,
  type Dict,
  type Priority,
  type StaffOption,
  PRIORITIES,
  priorityLabel,
} from '@/components/admin/tasks/taskBoardModel';
import { LabelPill } from '@/components/admin/tasks/TaskBoardParts';
import {
  TB_FIELD,
  TB_FIELD_SM,
  TB_LABEL,
  TB_MUTED,
  TB_PANEL,
  TB_TITLE,
} from './taskBoardClasses';

export type TaskBoardCardForm = {
  title: string;
  description: string;
  priority: Priority;
  due: string;
  assignee: string;
  labelNames: string[];
  adHocLabel: string;
};

export default function TaskBoardCardModal({
  t,
  open,
  editing,
  form,
  staff,
  boardLabels,
  labelDefByName,
  saving,
  deleting,
  adHocAdding,
  onTitleChange,
  onDescriptionChange,
  onPriorityChange,
  onDueChange,
  onAssigneeChange,
  onToggleLabel,
  onAdHocLabelChange,
  onAddAdHocLabel,
  onClose,
  onSave,
  onDelete,
  children,
}: {
  t: Dict;
  open: boolean;
  /** Vrai en édition d'une carte existante. */
  editing: boolean;
  form: TaskBoardCardForm;
  staff: StaffOption[];
  boardLabels: BoardLabel[];
  labelDefByName: Map<string, BoardLabel>;
  saving: boolean;
  deleting: boolean;
  adHocAdding: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPriorityChange: (value: Priority) => void;
  onDueChange: (value: string) => void;
  onAssigneeChange: (value: string) => void;
  onToggleLabel: (name: string) => void;
  onAdHocLabelChange: (value: string) => void;
  onAddAdHocLabel: () => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  /** Sections d'édition (checklist, commentaires, activité). */
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <h2 className={TB_TITLE}>
          {editing ? t.editCardTitle : t.newCardTitle}
        </h2>
      }
      size="2xl"
      panelChromeClassName={TB_PANEL}
      footer={
        <>
          {editing && (
            <AdminButton
              variant="danger"
              size="sm"
              className="mr-auto"
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? t.deleting : t.deleteCard}
            </AdminButton>
          )}
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
              ? editing
                ? t.saving
                : t.adding
              : editing
                ? t.save
                : t.add}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="card-title" className={TB_LABEL}>
            {t.cardTitleLabel}
          </label>
          <input
            id="card-title"
            type="text"
            value={form.title}
            onChange={(e) => onTitleChange(e.target.value)}
            className={TB_FIELD}
            placeholder={t.cardTitlePlaceholder}
          />
        </div>
        <div>
          <label htmlFor="card-desc" className={TB_LABEL}>
            {t.cardDescLabel}
          </label>
          <textarea
            id="card-desc"
            value={form.description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={3}
            className={TB_FIELD}
            placeholder={t.cardDescPlaceholder}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="card-priority" className={TB_LABEL}>
              {t.priorityLabel}
            </label>
            <select
              id="card-priority"
              value={form.priority}
              onChange={(e) => onPriorityChange(e.target.value as Priority)}
              className={TB_FIELD}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(t, p)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="card-due" className={TB_LABEL}>
              {t.dueDateLabel}
            </label>
            <input
              id="card-due"
              type="date"
              value={form.due}
              onChange={(e) => onDueChange(e.target.value)}
              className={TB_FIELD}
            />
          </div>
        </div>
        <div>
          <label htmlFor="card-assignee" className={TB_LABEL}>
            {t.assigneeLabel}
          </label>
          <select
            id="card-assignee"
            value={form.assignee}
            onChange={(e) => onAssigneeChange(e.target.value)}
            className={TB_FIELD}
          >
            <option value="">{t.unassigned}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={TB_LABEL}>{t.labelsLabel}</span>

          {/* Labels selectionnes sur la carte (clic = retirer). */}
          {form.labelNames.length > 0 && (
            <div className="mb-2">
              <span className={TB_MUTED}>{t.labelSelectorSelected}</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {form.labelNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onToggleLabel(name)}
                    title={t.labelRemoveFromCard}
                    aria-label={`${t.labelRemoveFromCard} : ${name}`}
                    className="inline-flex items-center gap-1 hover:opacity-80"
                  >
                    <LabelPill name={name} def={labelDefByName.get(name)} />
                    <span
                      aria-hidden="true"
                      className="text-xs text-[var(--t4,#807984)]"
                    >
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Labels du board non encore selectionnes (clic = ajouter). */}
          <p className={`mb-1 ${TB_MUTED}`}>{t.labelSelectorHint}</p>
          <div className="flex flex-wrap gap-1.5">
            {boardLabels
              .filter((l) => !form.labelNames.includes(l.name))
              .map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onToggleLabel(l.name)}
                  title={t.labelAddToCard}
                  aria-label={`${t.labelAddToCard} : ${l.name}`}
                  className="opacity-60 transition-opacity hover:opacity-100"
                >
                  <LabelPill name={l.name} def={l} />
                </button>
              ))}
            {boardLabels.length === 0 && (
              <span className={TB_MUTED}>{t.labelsPanelEmpty}</span>
            )}
          </div>

          {/* Ajout ad hoc d'un label au board a la volee. */}
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={form.adHocLabel}
              onChange={(e) => onAdHocLabelChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void onAddAdHocLabel();
                }
              }}
              placeholder={t.labelAdHocPlaceholder}
              aria-label={t.labelAdHocPlaceholder}
              maxLength={40}
              className={`flex-1 ${TB_FIELD_SM}`}
            />
            <AdminButton
              size="sm"
              onClick={() => void onAddAdHocLabel()}
              disabled={adHocAdding || !form.adHocLabel.trim()}
            >
              {t.labelAdHocAdd}
            </AdminButton>
          </div>
        </div>

        {/* Sections checklist + commentaires + activite : edition uniquement. */}
        {editing && (
          <div className="space-y-6 border-t border-[var(--line,rgba(194,196,201,.12))] pt-4">
            {children}
          </div>
        )}
      </div>
    </Modal>
  );
}
