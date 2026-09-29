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

export function statusLabel(status: TargetStatus | undefined, t: Dict): string {
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
      return 'text-[var(--lf-200,#b3e7a3)] bg-[rgba(127,202,101,.13)] border-[rgba(127,202,101,.36)]';
    case 'failed':
      return 'text-[#ffc2c2] bg-[rgba(255,107,107,.13)] border-[rgba(255,107,107,.4)]';
    default:
      return 'text-[var(--t3,#a39ba6)] border-[var(--line2,rgba(194,196,201,.2))]';
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
              className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4"
            >
              <p className="mb-2 line-clamp-2 text-sm text-neutral-300">
                {post.base_text}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {post.targets.map((target) => (
                  <span
                    key={target.platform}
                    className={`rounded-[3px] border px-2 py-0.5 font-mono text-xs ${statusClass(target.status)}`}
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
