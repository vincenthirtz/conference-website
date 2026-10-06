import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import {
  type CommentBulkAction,
  type CommentStatus,
  moderationClient,
  moderationPaths,
} from '@/features/admin/moderation/client';
import { useCommentSettings } from '@/features/admin/moderation/hooks/useCommentSettings';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import DeleteConfirmModal from '@/components/admin/DeleteConfirmModal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminCommentsList from '@/lib/i18n/locales/admin-fr/adminCommentsList';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import CommentModerationItem, {
  type CommentRow,
} from '@/features/admin/moderation/ui/CommentModerationItem';
import { useCommentSelection } from '@/features/admin/moderation/hooks/useCommentSelection';
import CommentSettingsSection from './CommentSettingsSection';

type ApiList = {
  comments: CommentRow[];
  total: number | null;
  counts?: { pending?: number };
  /** `false` : migration news_comments_moderation absente. */
  status_available?: boolean;
};

export default function CommentsPanel() {
  const t = useAdminT(nsAdminCommentsList);
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CommentStatus | ''>('');
  const [bulkBusy, setBulkBusy] = useState(false);
  // Méta de la liste, posées ensemble par chaque réponse (`onData`).
  const [listMeta, setListMeta] = useState({
    statusAvailable: true,
    pendingCount: 0,
  });
  const { statusAvailable, pendingCount } = listMeta;
  const { confirm, dialog } = useConfirmDialog();
  const commentSettings = useCommentSettings();

  const {
    data: comments,
    total,
    loading,
    error: fetchError,
    refresh,
    offset,
    limit,
    setOffset,
    nextPage,
    prevPage,
  } = useAdminResource<CommentRow, ApiList>(moderationPaths.moderatedComments, {
    limit: 30,
    query: search,
    params: { status: statusFilter || undefined },
    select: (res) => res.comments || [],
    selectTotal: (res) => res.total ?? null,
    onData: (res) =>
      setListMeta({
        statusAvailable: res.status_available !== false,
        pendingCount: res.counts?.pending ?? 0,
      }),
  });

  const error = mutationError ?? fetchError;

  const selection = useCommentSelection(comments);
  const { selected, allSelected } = selection;

  const dropDraft = (id: string) =>
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const runBulk = async (action: CommentBulkAction) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (action === 'delete') {
      const ok = await confirm({
        title: format(t.bulkDeleteTitle, { count: ids.length }),
        subtitle: t.bulkDeleteBody,
        variant: 'danger',
        confirmLabel: t.bulkDelete,
      });
      if (!ok) return;
    }
    setBulkBusy(true);
    setMutationError(null);
    try {
      const res = await moderationClient.bulkComments(ids, action);
      const toast = {
        show: t.toastBulkShow,
        hide: t.toastBulkHide,
        delete: t.toastBulkDelete,
      }[action];
      addToast(format(toast, { count: res.affected }), 'success');
      selection.clear();
      refresh();
    } catch (err: unknown) {
      setMutationError((err as Error)?.message || t.errorBulk);
    } finally {
      setBulkBusy(false);
    }
  };

  const setArticleClosed = async (
    article: { id: string; title: string | null },
    closed: boolean
  ) => {
    try {
      await commentSettings.setArticleClosed(article.id, closed);
      addToast(
        format(closed ? t.toastArticleClosed : t.toastArticleReopened, {
          title: article.title || t.articleFallback,
        }),
        'success'
      );
    } catch (err: unknown) {
      setMutationError((err as Error)?.message || t.errorClosure);
    }
  };

  const setPreModeration = async (on: boolean) => {
    try {
      await commentSettings.setPreModeration(on);
      addToast(
        on ? t.toastPreModerationOn : t.toastPreModerationOff,
        'success'
      );
    } catch (err: unknown) {
      setMutationError((err as Error)?.message || t.errorSettings);
    }
  };

  const filters: Array<{ value: CommentStatus | ''; label: string }> = [
    { value: '', label: t.filterAll },
    { value: 'pending', label: t.filterPending },
    { value: 'visible', label: t.filterVisible },
    { value: 'hidden', label: t.filterHidden },
  ];

  // Auto-recul d'une page quand la page courante devient vide et offset > 0
  // (ex. suppression du dernier commentaire d'une page > 1) : sans ça,
  // l'utilisateur reste sur une page vide.
  useEffect(() => {
    if (!loading && !fetchError && comments.length === 0 && offset > 0) {
      setOffset(Math.max(0, offset - limit));
    }
  }, [loading, fetchError, comments.length, offset, limit, setOffset]);

  const handleDelete = async (comment: CommentRow) => {
    setDeleting(true);
    setMutationError(null);
    try {
      await moderationClient.deleteComment(comment.id);
      setDeleteTarget(null);
      addToast(t.toastDeleted, 'success');
      refresh();
    } catch (err: unknown) {
      setMutationError((err as Error)?.message || t.errorDelete);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (c: CommentRow) => {
    const newContent = editing[c.id] ?? c.content;
    setSaving(c.id);
    setMutationError(null);
    try {
      await moderationClient.updateComment(c.id, newContent);
      dropDraft(c.id);
      addToast(t.toastUpdated, 'success');
      refresh();
    } catch (err: unknown) {
      setMutationError((err as Error)?.message || t.errorUpdate);
    } finally {
      setSaving(null);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
  };

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--fd)] text-3xl md:text-4xl font-extrabold tracking-tight [font-stretch:75%]">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {total !== null
                ? format(total > 1 ? t.count_other : t.count_one, {
                    count: total,
                  })
                : t.loading}
            </p>
          </div>
          {pendingCount > 0 && (
            <Chip tone="warn">
              {format(t.pendingBadge, { count: pendingCount })}
            </Chip>
          )}
        </div>
      </div>

      {commentSettings.settings && (
        <CommentSettingsSection
          t={t}
          settings={commentSettings.settings}
          busy={commentSettings.busy}
          onTogglePreModeration={(on) => void setPreModeration(on)}
          onReopen={(a) => void setArticleClosed(a, false)}
        />
      )}

      {!statusAvailable && (
        <p
          role="note"
          className="mb-6 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] px-4 py-3 text-sm text-neutral-400"
        >
          {t.statusUnavailable}
        </p>
      )}

      {/* Messages */}
      {error && (
        <div className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] text-[#ffc2c2] px-4 py-3 text-sm flex items-center gap-2">
          <svg
            className="w-5 h-5 text-red-400 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </div>
      )}

      {/* Filters */}
      <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6 mb-6">
        <form
          onSubmit={handleSearchSubmit}
          className="flex gap-4 flex-wrap items-end"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-neutral-400 mb-1">
              {t.searchLabel}
            </label>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                className="w-full pl-10 pr-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <AdminButton variant="ghost" size="sm" type="submit">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {t.searchButton}
          </AdminButton>
        </form>

        {statusAvailable && (
          <fieldset className="mt-4 flex flex-wrap items-center gap-2">
            <legend className="sr-only">{t.filterLabel}</legend>
            {filters.map((f) => (
              <AdminButton
                key={f.value || 'all'}
                variant={statusFilter === f.value ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={statusFilter === f.value}
                onClick={() => {
                  setStatusFilter(f.value);
                  setOffset(0);
                }}
              >
                {f.label}
              </AdminButton>
            ))}
          </fieldset>
        )}
      </section>

      {/* Actions en masse : visibles dès qu'une ligne est cochée. */}
      {comments.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--or,#b467d1)]"
              checked={allSelected}
              onChange={selection.toggleAll}
            />
            {t.selectAllPage}
          </label>
          {selected.size > 0 && (
            <>
              <span className="text-neutral-400" aria-live="polite">
                {format(t.selectedCount, { count: selected.size })}
              </span>
              {statusAvailable && (
                <>
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    disabled={bulkBusy}
                    onClick={() => void runBulk('show')}
                  >
                    {t.bulkShow}
                  </AdminButton>
                  <AdminButton
                    variant="ghost"
                    size="sm"
                    disabled={bulkBusy}
                    onClick={() => void runBulk('hide')}
                  >
                    {t.bulkHide}
                  </AdminButton>
                </>
              )}
              <AdminButton
                variant="danger"
                size="sm"
                disabled={bulkBusy}
                onClick={() => void runBulk('delete')}
              >
                {t.bulkDelete}
              </AdminButton>
              <AdminButton
                variant="ghost"
                size="sm"
                disabled={bulkBusy}
                onClick={selection.clear}
              >
                {t.clearSelection}
              </AdminButton>
            </>
          )}
        </div>
      )}

      {/* Comments List */}
      <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)] rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-20 text-neutral-400">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-neutral-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            {t.emptyState}
          </div>
        ) : (
          <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
            {comments.map((c) => (
              <CommentModerationItem
                key={c.id}
                comment={c}
                t={t}
                statusAvailable={statusAvailable}
                selected={selection.selected.has(c.id)}
                onToggleSelected={() => selection.toggle(c.id)}
                draft={editing[c.id]}
                onDraftChange={(value) =>
                  setEditing((prev) => ({ ...prev, [c.id]: value }))
                }
                onCancelDraft={() => dropDraft(c.id)}
                saving={saving === c.id}
                onSave={() => handleSave(c)}
                canCloseArticle={
                  !!c.news &&
                  !!commentSettings.settings?.closure_available &&
                  !commentSettings.isClosed(c.news_id)
                }
                closeBusy={commentSettings.busy}
                onCloseArticle={() =>
                  void setArticleClosed(
                    { id: c.news_id, title: c.news?.title ?? null },
                    true
                  )
                }
                onDelete={() => setDeleteTarget(c)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Pagination : rester visible quand la page courante est vide mais
              offset > 0 (ex. suppression du dernier commentaire d'une page),
              sinon le bouton « Précédent » disparaît et l'offset reste coincé. */}
      {(comments.length > 0 || offset > 0) && (
        <div className="flex justify-between items-center mt-6">
          <AdminButton
            variant="ghost"
            size="sm"
            disabled={offset === 0 || loading}
            onClick={prevPage}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t.previous}
          </AdminButton>

          <span className="text-neutral-400 text-sm">
            {offset + 1} – {offset + comments.length}
            {total ? format(t.paginationOf, { total }) : ''}
          </span>

          <AdminButton
            variant="ghost"
            size="sm"
            disabled={loading || (total !== null && offset + limit >= total)}
            onClick={nextPage}
          >
            {t.next}
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </AdminButton>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          title={t.deleteModalTitle}
          subtitle={t.deleteModalSubtitle}
          deleting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        >
          <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3">
            <div className="text-xs text-neutral-500 mb-1">
              {format(t.byAuthor, {
                author: deleteTarget.author_name || t.anonymous,
              })}
            </div>
            <p className="text-sm text-neutral-300 line-clamp-3">
              {deleteTarget.content}
            </p>
          </div>
        </DeleteConfirmModal>
      )}
      {dialog}
    </>
  );
}
