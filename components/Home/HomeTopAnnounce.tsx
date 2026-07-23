// components/Home/HomeTopAnnounce.tsx
//
// Barre d'annonce fine et dismissible en haut de la refonte accueil. Reprend la
// première annonce active (même source que l'AnnouncementsTicker) et n'affiche
// rien s'il n'y en a pas. Le "dismiss" est purement local (état client) et
// mémorisé par id dans sessionStorage pour ne pas ré-apparaître pendant la
// session.

import { useEffect, useState, type JSX } from 'react';
import Link from 'next/link';
import { type Announcement } from '@/components/Ads/AnnouncementsTicker';
import { useT } from '@/lib/i18n/useT';

type HomeTopAnnounceProps = {
  announcement: Announcement | null;
};

const DISMISS_KEY = 'homeV2-topannounce-dismissed';

export default function HomeTopAnnounce({
  announcement,
}: HomeTopAnnounceProps): JSX.Element | null {
  const t = useT('homeV2');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!announcement) return;
    try {
      const stored = sessionStorage.getItem(DISMISS_KEY);
      if (stored && stored === announcement.id) setDismissed(true);
    } catch {
      /* sessionStorage indisponible : on garde la barre visible */
    }
  }, [announcement]);

  if (!announcement || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, announcement.id);
    } catch {
      /* no-op */
    }
  };

  return (
    <div
      className="border-b border-white/10 bg-gradient-to-r from-[var(--color-violet)]/20 to-[var(--color-green)]/15 text-sm"
      role="region"
      aria-label={t.announceAria}
    >
      <div className="container mx-auto flex items-center justify-center gap-3 px-4 py-2.5">
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-yellow)] shadow-[0_0_10px_var(--color-yellow)]"
        />
        <p className="min-w-0 truncate text-center text-gray-100">
          {announcement.message || announcement.title}
        </p>
        {announcement.ctaUrl && (
          <Link
            href={announcement.ctaUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 font-semibold text-[var(--color-green-light)] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] rounded"
          >
            {announcement.ctaLabel || t.announceCta}
            <span aria-hidden> →</span>
          </Link>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t.announceDismiss}
          className="ml-1 shrink-0 rounded p-1 text-gray-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
