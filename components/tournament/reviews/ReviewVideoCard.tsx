// components/tournament/reviews/ReviewVideoCard.tsx
//
// Carte d'une vidéo de la playlist « Reviews ».
//
// FAÇADE AVANT CONSENTEMENT : tant que la visiteuse n'a pas cliqué sur
// « lire », AUCUNE ressource n'est demandée à YouTube. La miniature passe par
// l'optimiseur d'images Next (`/_next/image`, même origine — remotePattern
// i.ytimg.com dans next.config.js) : le navigateur ne contacte pas Google pour
// l'afficher. Le clic sur le bouton de lecture EST le consentement, vidéo par
// vidéo ; il charge alors le lecteur youtube-nocookie.com (CSP frame-src,
// proxy.ts).

import { useState } from 'react';
import Image from 'next/image';
import { useT, format } from '@/lib/i18n/useT';
import nsTournamentReviews from '@/lib/i18n/locales/fr/tournamentReviews';
import { nocookieEmbedUrl, videoWatchUrl } from '@/utils/youtube/playlist';
import type { ReviewVideo } from '@/utils/youtube/playlistFeed';

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ReviewVideoCard({
  video,
  playlistId,
  locale,
}: {
  video: ReviewVideo;
  playlistId: string;
  locale: string;
}) {
  const t = useT(nsTournamentReviews);
  const [playing, setPlaying] = useState(false);
  const title = video.title || t.untitled;
  const date = formatDate(video.publishedAt, locale);

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-black/60">
      <div className="relative aspect-video w-full bg-neutral-900">
        {playing ? (
          <iframe
            src={nocookieEmbedUrl(video.id)}
            title={format(t.playerTitle, { title })}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={format(t.play, { title })}
            className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-violet)]"
          >
            <Image
              src={video.thumbnailUrl}
              alt=""
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-opacity group-hover:opacity-80"
            />
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 ring-1 ring-white/30 transition-transform group-hover:scale-110 group-focus-visible:scale-110"
            >
              <svg
                viewBox="0 0 24 24"
                className="ml-1 h-6 w-6 fill-white"
                focusable="false"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold text-white">
          {title}
        </h3>
        {date && (
          <p className="text-xs text-gray-400">
            <time dateTime={video.publishedAt}>
              {format(t.publishedOn, { date })}
            </time>
          </p>
        )}
        <a
          href={videoWatchUrl(video.id, playlistId)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto self-start text-xs text-[var(--color-violet-light)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] rounded"
        >
          {t.watchOnYoutube}
        </a>
      </div>
    </article>
  );
}
