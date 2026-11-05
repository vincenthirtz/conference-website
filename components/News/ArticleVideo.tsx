// components/News/ArticleVideo.tsx
//
// Lecteur d'une vidéo YouTube citée dans une actualité (utils/news/newsVideos).
//
// Même façade que les bilans de tournoi (ReviewVideoCard) : tant que la
// visiteuse n'a pas cliqué sur « lire », AUCUNE ressource n'est demandée à
// YouTube. La miniature passe par l'optimiseur d'images de Next (même origine,
// remotePattern i.ytimg.com) ; le clic, qui vaut consentement, charge le
// lecteur youtube-nocookie.com (CSP frame-src, proxy.ts).

import { useState } from 'react';
import Image from 'next/image';
import { nocookieEmbedUrl, videoThumbnailUrl } from '@/utils/youtube/playlist';

export default function ArticleVideo({
  videoId,
  playLabel,
  playerTitle,
}: {
  videoId: string;
  /** Nom accessible du bouton de lecture. */
  playLabel: string;
  /** Titre du lecteur une fois chargé. */
  playerTitle: string;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative mt-8 aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-900">
      {playing ? (
        <iframe
          src={nocookieEmbedUrl(videoId)}
          title={playerTitle}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={playLabel}
          className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-violet)]"
        >
          <Image
            src={videoThumbnailUrl(videoId)}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 736px"
            className="object-cover transition-opacity group-hover:opacity-80"
          />
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 ring-1 ring-white/30 transition-transform group-hover:scale-110 group-focus-visible:scale-110"
          >
            <svg
              viewBox="0 0 24 24"
              className="ml-1 h-7 w-7 fill-white"
              focusable="false"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
