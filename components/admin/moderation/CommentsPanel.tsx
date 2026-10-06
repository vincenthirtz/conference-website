import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import CommentSettingsSection from './CommentSettingsSection';

type CommentRow = {
  id: string;
  news_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  status?: CommentStatus;
  news?: { id: string; title: string | null; slug: string | null } | null;
};

type ApiList = {
  comments: CommentRow[];
  total: number | null;
  counts?: { pending?: number };
  /** `false` : migration news_comments_moderation absente. */
  status_available?: boolean;
};

const STATUS_TONE: Record<CommentStatus, ChipTone> = {
  visible: 'ok',
  pending: 'warn',
  hidden: 'neutral',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [statusAvailable, setStatusAvailable] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
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
    onData: (res) => {
      setStatusAvailable(res.status_available !== false);
      setPendingCount(res.counts?.pending ?? 0);
    },
  });

  const error = mutationError ?? fetchError;

  // La sélection ne survit pas à un changement de page ou de filtre : une
  // action en masse ne doit viser que ce qui est sous les yeux.
  const pageIds = useMemo(() => comments.map((c) => c.id), [comments]);
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => pageIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pageIds]);

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(pageIds));

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
      setSelected(new Set());
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

  const statusLabel: Record<CommentStatus, string> = {
    visible: t.statusVisible,
    pending: t.statusPending,
    hidden: t.statusHidden,
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
      setEditing((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
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
              onChange={toggleAll}
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
                onClick={() => setSelected(new Set())}
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
              <div
                key={c.id}
                className="p-4 hover:bg-neutral-700/20 transition-colors"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--or,#b467d1)]"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSelected(c.id)}
                      aria-label={format(t.selectComment, {
                        author: c.author_name || t.anonymous,
                      })}
                    />
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                      <svg
                        className="w-5 h-5 text-neutral-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-white">
                        {c.author_name || t.anonymous}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {formatDate(c.created_at)}
                      </div>
                    </div>
                    {statusAvailable && c.status && (
                      <Chip tone={STATUS_TONE[c.status]}>
                        {statusLabel[c.status]}
                      </Chip>
                    )}
                  </div>

                  {/* News link */}
                  {c.news && (
                    <Link
                      href={`/news/${c.news.slug || c.news.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-2 py-1 text-xs text-[var(--or-200,#eec4ff)] hover:text-[var(--t1,#f4edf7)]"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                      {c.news.title || t.articleFallback}
                    </Link>
                  )}
                </div>

                {/* Content */}
                <textarea
                  className="w-full resize-none rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-4 py-3 text-sm text-white focus:border-[var(--or,#b467d1)] focus:outline-none"
                  value={editing[c.id] ?? c.content}
                  onChange={(e) =>
                    setEditing((prev) => ({
                      ...prev,
                      [c.id]: e.target.value,
                    }))
                  }
                  rows={3}
                />

                {/* Actions */}
                <div className="flex items-center gap-3 mt-3">
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSave(c)}
                    disabled={saving === c.id || editing[c.id] === undefined}
                    className={saving === c.id ? 'cursor-wait' : ''}
                  >
                    {saving === c.id ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t.saving}
                      </>
                    ) : (
                      <>
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        {t.save}
                      </>
                    )}
                  </AdminButton>

                  {editing[c.id] !== undefined && (
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditing((prev) => {
                          const next = { ...prev };
                          delete next[c.id];
                          return next;
                        })
                      }
                    >
                      {t.cancel}
                    </AdminButton>
                  )}

                  {c.news &&
                    commentSettings.settings?.closure_available &&
                    !commentSettings.isClosed(c.news_id) && (
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        disabled={commentSettings.busy}
                        onClick={() =>
                          void setArticleClosed(
                            {
                              id: c.news_id,
                              title: c.news?.title ?? null,
                            },
                            true
                          )
                        }
                      >
                        {t.closeArticle}
                      </AdminButton>
                    )}

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(c)}
                    className="ml-auto rounded-[var(--r-ctrl,4px)] border border-transparent p-2 text-[var(--err,#ff6b6b)] transition-colors hover:border-[rgba(255,107,107,.45)]"
                    title={t.delete}
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
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
