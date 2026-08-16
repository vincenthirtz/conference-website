import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import DeleteConfirmModal from '@/components/admin/DeleteConfirmModal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminCommentsList from '@/lib/i18n/locales/admin-fr/adminCommentsList';

type CommentRow = {
  id: string;
  news_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  news?: { id: string; title: string | null; slug: string | null } | null;
};

type ApiList = {
  comments: CommentRow[];
  total: number | null;
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
  const { adminFetchJson } = useAdminFetch();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

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
  } = useAdminResource<CommentRow, ApiList>('/api/admin/comments', {
    limit: 30,
    query: search,
    select: (res) => res.comments || [],
    selectTotal: (res) => res.total ?? null,
  });

  const error = mutationError ?? fetchError;

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
      await adminFetchJson('/api/admin/comments', {
        method: 'DELETE',
        body: JSON.stringify({ id: comment.id }),
      });
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
      await adminFetchJson('/api/admin/comments', {
        method: 'PATCH',
        body: JSON.stringify({ id: c.id, content: newContent }),
      });
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
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
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
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
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
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
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
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {t.searchButton}
          </button>
        </form>
      </section>

      {/* Comments List */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
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
          <div className="divide-y divide-neutral-700/50">
            {comments.map((c) => (
              <div
                key={c.id}
                className="p-4 hover:bg-neutral-700/20 transition-colors"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
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
                  </div>

                  {/* News link */}
                  {c.news && (
                    <Link
                      href={`/news/${c.news.slug || c.news.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-neutral-800 px-2 py-1 rounded-lg"
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
                  className="w-full rounded-xl bg-neutral-900/50 border border-neutral-600 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
                  <button
                    type="button"
                    onClick={() => handleSave(c)}
                    disabled={saving === c.id || editing[c.id] === undefined}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                      saving === c.id
                        ? 'bg-blue-800 cursor-wait'
                        : editing[c.id] !== undefined
                          ? 'bg-blue-600 hover:bg-blue-700'
                          : 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
                    }`}
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
                  </button>

                  {editing[c.id] !== undefined && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditing((prev) => {
                          const next = { ...prev };
                          delete next[c.id];
                          return next;
                        })
                      }
                      className="px-3 py-2 rounded-xl text-sm text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                    >
                      {t.cancel}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(c)}
                    className="ml-auto p-2 rounded-lg hover:bg-red-900/50 text-red-400 transition-colors"
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
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={prevPage}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          </button>

          <span className="text-neutral-400 text-sm">
            {offset + 1} – {offset + comments.length}
            {total ? format(t.paginationOf, { total }) : ''}
          </span>

          <button
            type="button"
            disabled={loading || (total !== null && offset + limit >= total)}
            onClick={nextPage}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          </button>
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
          <div className="bg-neutral-900/50 rounded-xl p-3">
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
    </>
  );
}
