// features/admin/tasks/ui/TaskBoardCardSections.tsx — sections de la carte en
// édition : checklist (barre d'avancement, cocher, supprimer, ajouter) et
// commentaires (liste, modification, suppression, saisie). Les mises à jour
// optimistes et les appels restent dans la page ; ici, l'affichage, les gestes
// et le brouillon d'une modification en cours (état local).
//
// Droits (les mêmes que l'API, qui tranche) : modifier = la personne qui a
// écrit le commentaire ; supprimer = elle, ou un admin / owner.

import { type KeyboardEvent, useState } from 'react';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  type ChecklistItem,
  type Dict,
  type TaskComment,
  formatCommentDate,
} from '@/components/admin/tasks/taskBoardModel';
import {
  TB_CHECKBOX,
  TB_FIELD,
  TB_FIELD_SM,
  TB_MUTED,
} from './taskBoardClasses';

const SECTION_TITLE = 'text-sm font-semibold text-[var(--t1,#f4edf7)]';
const ROW_DELETE =
  'rounded-[3px] px-1.5 text-[var(--t4,#807984)] hover:bg-[rgba(255,107,107,.08)] hover:text-[var(--err,#ff6b6b)]';

export function TaskBoardChecklistSection({
  t,
  items,
  loading,
  input,
  adding,
  onInputChange,
  onAdd,
  onToggle,
  onDelete,
}: {
  t: Dict;
  items: ChecklistItem[];
  loading: boolean;
  input: string;
  adding: boolean;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onToggle: (item: ChecklistItem) => void;
  onDelete: (item: ChecklistItem) => void;
}) {
  const doneCount = items.filter((i) => i.isDone).length;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className={SECTION_TITLE}>{t.checklistTitle}</h3>
        {items.length > 0 && (
          <span className="text-xs text-[var(--t3,#a39ba6)]" data-numeric>
            {doneCount}/{items.length}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--s3,#2f2732)]">
          <div
            className="h-full rounded-full bg-[var(--lf,#7fca65)] transition-all"
            style={{
              width: `${Math.round((doneCount / items.length) * 100)}%`,
            }}
          />
        </div>
      )}
      {loading ? (
        <p className={TB_MUTED}>{t.loading}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.length === 0 && (
            <li className={TB_MUTED}>{t.checklistEmpty}</li>
          )}
          {items.map((item) => (
            <li key={item.id} className="group flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.isDone}
                onChange={() => onToggle(item)}
                aria-label={item.label}
                className={`${TB_CHECKBOX} flex-shrink-0`}
              />
              <span
                className={`flex-1 text-sm ${
                  item.isDone
                    ? 'text-[var(--t4,#807984)] line-through'
                    : 'text-[var(--t2,#c7bfca)]'
                }`}
              >
                {item.label}
              </span>
              <button
                type="button"
                onClick={() => onDelete(item)}
                title={t.checklistDelete}
                aria-label={t.checklistDelete}
                className={ROW_DELETE}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onAdd();
            }
          }}
          placeholder={t.checklistAddPlaceholder}
          className={`flex-1 ${TB_FIELD_SM}`}
        />
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={() => void onAdd()}
          disabled={adding || !input.trim()}
        >
          {t.checklistAdd}
        </AdminButton>
      </div>
    </section>
  );
}

/** Ctrl (ou Cmd) + Entrée dans une zone de texte. */
function isSubmitShortcut(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && (e.ctrlKey || e.metaKey);
}

export function TaskBoardCommentsSection({
  t,
  comments,
  loading,
  input,
  posting,
  currentStaffId,
  canModerate,
  onInputChange,
  onSubmit,
  onEdit,
  onDelete,
}: {
  t: Dict;
  comments: TaskComment[];
  loading: boolean;
  input: string;
  posting: boolean;
  /** Staff connecté : il modifie et supprime ses propres commentaires. */
  currentStaffId: string;
  /** Admin / owner : supprime aussi ceux des autres. */
  canModerate: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  /** Enregistre le nouveau texte ; `true` si l'API l'a accepté. */
  onEdit: (comment: TaskComment, body: string) => Promise<boolean>;
  onDelete: (comment: TaskComment) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  async function saveEdit(comment: TaskComment) {
    const body = draft.trim();
    if (!body || editSaving) return;
    if (body === comment.body.trim()) {
      setEditingId(null);
      return;
    }
    setEditSaving(true);
    const ok = await onEdit(comment, body);
    setEditSaving(false);
    if (ok) setEditingId(null);
  }

  return (
    <section>
      <h3 className={`mb-2 ${SECTION_TITLE}`}>{t.commentsTitle}</h3>
      {loading ? (
        <p className={TB_MUTED}>{t.loading}</p>
      ) : (
        <ul className="space-y-3">
          {comments.length === 0 && (
            <li className={TB_MUTED}>{t.commentsEmpty}</li>
          )}
          {comments.map((c) => {
            const mine =
              !!c.authorStaffId && c.authorStaffId === currentStaffId;
            const canDelete = mine || canModerate;
            const isEditing = editingId === c.id;
            return (
              <li
                key={c.id}
                className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-2.5"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--t1,#f4edf7)]">
                    {c.authorName ?? t.unknownAuthor}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] text-[var(--t4,#807984)]"
                      data-numeric
                    >
                      {formatCommentDate(c.createdAt)}
                      {c.editedAt && (
                        <span title={formatCommentDate(c.editedAt)}>
                          {' '}
                          · {t.commentEdited}
                        </span>
                      )}
                    </span>
                    {mine && !isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(c.id);
                          setDraft(c.body);
                        }}
                        className="rounded-[3px] px-1.5 text-[11px] text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
                      >
                        {t.commentEdit}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void onDelete(c)}
                        title={t.commentDelete}
                        aria-label={t.commentDelete}
                        className={ROW_DELETE}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (isSubmitShortcut(e)) {
                          e.preventDefault();
                          void saveEdit(c);
                        } else if (e.key === 'Escape') {
                          // Annule la modification sans fermer la fenêtre.
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingId(null);
                        }
                      }}
                      rows={3}
                      maxLength={5000}
                      aria-label={t.commentEditLabel}
                      className={TB_FIELD}
                    />
                    <div className="flex justify-end gap-2">
                      <AdminButton size="sm" onClick={() => setEditingId(null)}>
                        {t.cancel}
                      </AdminButton>
                      <AdminButton
                        variant="secondary"
                        size="sm"
                        onClick={() => void saveEdit(c)}
                        disabled={editSaving || !draft.trim()}
                      >
                        {editSaving ? t.saving : t.save}
                      </AdminButton>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm text-[var(--t2,#c7bfca)]">
                    {c.body}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 space-y-2">
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (isSubmitShortcut(e) && !posting && input.trim()) {
              e.preventDefault();
              void onSubmit();
            }
          }}
          rows={2}
          maxLength={5000}
          placeholder={t.commentPlaceholder}
          aria-label={t.commentsTitle}
          className={TB_FIELD}
        />
        <div className="flex items-center justify-end gap-3">
          <span className={TB_MUTED}>{t.commentShortcutHint}</span>
          <AdminButton
            variant="secondary"
            size="sm"
            onClick={() => void onSubmit()}
            disabled={posting || !input.trim()}
          >
            {posting ? t.commentPosting : t.commentSubmit}
          </AdminButton>
        </div>
      </div>
    </section>
  );
}
