// features/admin/moderation/ui/CommentModerationItem.tsx — un commentaire
// dans la file de modération (components/admin/moderation/CommentsPanel.tsx) :
// case de sélection (actions en masse), statut, article, édition du texte,
// fermeture des commentaires de l'article, suppression. Présentationnel :
// brouillon, sauvegarde et appels restent au panneau.

import Link from 'next/link';
import type { CommentStatus } from '@/features/admin/moderation/client';
import { format } from '@/lib/i18n/useAdminT';
import type nsAdminCommentsList from '@/lib/i18n/locales/admin-fr/adminCommentsList';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

export type CommentRow = {
  id: string;
  news_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  status?: CommentStatus;
  news?: { id: string; title: string | null; slug: string | null } | null;
};

type Dict = typeof nsAdminCommentsList.fr;

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

export default function CommentModerationItem({
  comment: c,
  t,
  statusAvailable,
  selected,
  onToggleSelected,
  draft,
  onDraftChange,
  onCancelDraft,
  saving,
  onSave,
  canCloseArticle,
  closeBusy,
  onCloseArticle,
  onDelete,
}: {
  comment: CommentRow;
  t: Dict;
  statusAvailable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  /** Texte en cours d'édition ; `undefined` = pas de modification. */
  draft: string | undefined;
  onDraftChange: (value: string) => void;
  onCancelDraft: () => void;
  saving: boolean;
  onSave: () => void;
  canCloseArticle: boolean;
  closeBusy: boolean;
  onCloseArticle: () => void;
  onDelete: () => void;
}) {
  const statusLabel: Record<CommentStatus, string> = {
    visible: t.statusVisible,
    pending: t.statusPending,
    hidden: t.statusHidden,
  };
  return (
    <div className="p-4 hover:bg-neutral-700/20 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--or,#b467d1)]"
            checked={selected}
            onChange={onToggleSelected}
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
            <Chip tone={STATUS_TONE[c.status]}>{statusLabel[c.status]}</Chip>
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
        value={draft ?? c.content}
        onChange={(e) => onDraftChange(e.target.value)}
        rows={3}
      />

      {/* Actions */}
      <div className="flex items-center gap-3 mt-3">
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={onSave}
          disabled={saving || draft === undefined}
          className={saving ? 'cursor-wait' : ''}
        >
          {saving ? (
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

        {draft !== undefined && (
          <AdminButton variant="ghost" size="sm" onClick={onCancelDraft}>
            {t.cancel}
          </AdminButton>
        )}

        {canCloseArticle && (
          <AdminButton
            variant="ghost"
            size="sm"
            disabled={closeBusy}
            onClick={onCloseArticle}
          >
            {t.closeArticle}
          </AdminButton>
        )}

        <button
          type="button"
          onClick={onDelete}
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
  );
}
