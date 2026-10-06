// components/admin/moderation/CommentSettingsSection.tsx — réglages des
// commentaires : interrupteur de pré-modération et articles aux commentaires
// fermés (avec « Rouvrir »). L'état vit dans `useCommentSettings`, partagé
// avec la file pour le bouton « Fermer les commentaires » de chaque ligne.

import Link from 'next/link';
import type { CommentSettings } from '@/features/admin/moderation/client';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type nsAdminCommentsList from '@/lib/i18n/locales/admin-fr/adminCommentsList';

type T = typeof nsAdminCommentsList.fr;

export default function CommentSettingsSection({
  t,
  settings,
  busy,
  onTogglePreModeration,
  onReopen,
}: {
  t: T;
  settings: CommentSettings;
  busy: boolean;
  onTogglePreModeration: (on: boolean) => void;
  onReopen: (article: { id: string; title: string | null }) => void;
}) {
  return (
    <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6 mb-6">
      <h2 className="text-lg font-semibold text-white">{t.settingsHeading}</h2>

      {settings.status_available && (
        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--or,#b467d1)]"
            checked={settings.pre_moderation}
            disabled={busy}
            onChange={(e) => onTogglePreModeration(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-white">
              {t.preModerationLabel}
            </span>
            <span className="block text-xs text-neutral-400">
              {t.preModerationHint}
            </span>
          </span>
        </label>
      )}

      {settings.closure_available && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-neutral-300">
            {t.closedArticlesHeading}
          </h3>
          {settings.closed_articles.length === 0 ? (
            <p className="mt-1 text-xs text-neutral-500">
              {t.closedArticlesEmpty}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {settings.closed_articles.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <Link
                    href={`/news/${a.slug || a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[var(--or-200,#eec4ff)] hover:underline"
                  >
                    {a.title || t.articleFallback}
                  </Link>
                  <AdminButton
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onReopen(a)}
                  >
                    {t.reopenArticle}
                  </AdminButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
