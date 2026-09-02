// components/admin/communications/SocialPostsHistory.tsx
//
// L'historique des posts multi-cibles : ce qui est parti, où, et ce qui a
// échoué.
//
// Extrait de `SocialPostsPanel` quand celui-ci a dépassé le plafond de taille
// des écrans admin (cf. tests/unit/adminFileSizeGuard.test.ts). La coupe tombe
// bien : composer un post et relire ce qui est déjà parti n'ont ni le même
// état ni le même moment d'usage — l'un est un formulaire, l'autre une liste
// en lecture seule.

import type { JSX } from 'react';
import type { SocialPlatformKey } from '@/utils/social/platforms';
import nsAdminSocialPosts from '@/lib/i18n/locales/admin-fr/adminSocialPosts';

type Dict = typeof nsAdminSocialPosts.fr;

export type TargetStatus = 'sent' | 'failed' | 'pending' | 'skipped';

export type HistoryTarget = {
  platform: SocialPlatformKey;
  status: TargetStatus;
  permalink: string | null;
  error: string | null;
  sent_at: string | null;
};

export type HistoryPost = {
  id: string;
  base_text: string;
  status: string;
  published_at: string | null;
  created_at: string;
  targets: HistoryTarget[];
};

export function statusLabel(
  status: TargetStatus | undefined,
  t: Dict
): string {
  switch (status) {
    case 'sent':
      return t.statusSent;
    case 'failed':
      return t.statusFailed;
    case 'skipped':
      return t.statusSkipped;
    default:
      return t.statusPending;
  }
}

export function statusClass(status: TargetStatus | undefined): string {
  switch (status) {
    case 'sent':
      return 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30';
    case 'failed':
      return 'bg-red-600/20 text-red-300 border-red-500/30';
    default:
      return 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30';
  }
}

export default function SocialPostsHistory({
  posts,
  t,
}: {
  posts: HistoryPost[];
  t: Dict;
}): JSX.Element {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-200">
        {t.historyTitle}
      </h3>
      {posts.length === 0 ? (
        <p className="text-sm text-neutral-500">{t.historyEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((post) => (
            <li
              key={post.id}
              className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4"
            >
              <p className="mb-2 line-clamp-2 text-sm text-neutral-300">
                {post.base_text}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {post.targets.map((target) => (
                  <span
                    key={target.platform}
                    className={`rounded border px-2 py-0.5 font-mono text-xs ${statusClass(target.status)}`}
                    title={target.error ?? undefined}
                  >
                    {target.platform} · {statusLabel(target.status, t)}
                    {target.permalink ? (
                      <>
                        {' '}
                        <a
                          href={target.permalink}
                          className="underline underline-offset-2"
                        >
                          {t.seePost}
                        </a>
                      </>
                    ) : null}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
