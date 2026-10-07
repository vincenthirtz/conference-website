// components/Home/HomeEventSpotlight.tsx
//
// L'encart d'un événement ponctuel (config/homeEventSpotlight.ts) — logo,
// vidéo d'annonce, lien vers la fiche du tournoi et bouton d'inscription.
//
// POURQUOI JUSTE SOUS LE HERO. L'événement a une date, et l'inscription se
// ferme avec elle : rangé après les actus, il serait découvert trop tard. Le
// hero, lui, reste à la saison régulière — l'encart ne lui vole aucun bouton.
//
// LA VIDÉO SUIT LA LANGUE DU SITE. Une version FR, une version EN ; la langue
// sans vidéo retombe sur l'autre. Même façade que les reviews
// (ReviewVideoCard) : rien n'est demandé à YouTube avant le clic sur « lire ».

import { useState, type JSX } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';
import type { HomeEventSpotlight as HomeEventConfig } from '@/config/homeEventSpotlight';
import { tournamentRegisterHref } from '@/utils/tournaments/registerHref';
import { nocookieEmbedUrl, videoThumbnailUrl } from '@/utils/youtube/playlist';

export default function HomeEventSpotlight({
  event,
}: {
  event: HomeEventConfig;
}): JSX.Element {
  const t = useT(nsHomeV2);
  const locale = useLocale();
  const [playing, setPlaying] = useState(false);

  const isEn = locale.startsWith('en');
  const videoId =
    (isEn ? event.youtubeIds.en : event.youtubeIds.fr) ||
    event.youtubeIds.fr ||
    event.youtubeIds.en;

  const registerHref = tournamentRegisterHref({
    id: event.tournamentId,
    solo_mode: event.soloMode,
    pooled_teams: event.pooledTeams,
  });
  const date = new Date(event.date).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  });

  return (
    <section
      id="event"
      aria-labelledby="home-event-title"
      className="container mx-auto mt-10 px-4 md:mt-14 md:px-0"
    >
      <div className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-950/60 via-black/70 to-purple-950/60 px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-24 -top-24 h-[320px] w-[320px] rounded-full bg-orange-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-[320px] w-[320px] rounded-full bg-[var(--color-violet)]/20 blur-3xl" />
        </div>

        <div
          className={`relative grid items-center gap-8 ${
            videoId ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : ''
          }`}
        >
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:text-left">
            <Image
              src={event.logoSrc}
              alt={t.eventLogoAlt}
              width={160}
              height={160}
              className="h-28 w-28 shrink-0 drop-shadow-[0_0_24px_rgba(249,115,22,0.45)] sm:h-40 sm:w-40"
            />
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
                {t.eventEyebrow} · <time dateTime={event.date}>{date}</time>
              </p>
              <h2
                id="home-event-title"
                className="mt-2 text-2xl font-bold text-white sm:text-3xl"
              >
                {t.eventTitle}
              </h2>
              <p className="mt-3 text-sm text-gray-300 sm:text-base">
                {t.eventBody}
              </p>

              <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link
                  href={registerHref}
                  className="flex min-h-[44px] items-center justify-center rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 sm:text-base"
                >
                  {t.eventCtaRegister}
                </Link>
                <Link
                  href={`/tournament/${event.tournamentSlug}`}
                  className="flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 sm:text-base"
                >
                  {t.eventCtaDetails}
                </Link>
              </div>
            </div>
          </div>

          {videoId && (
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-900">
              {playing ? (
                <iframe
                  src={nocookieEmbedUrl(videoId)}
                  title={t.eventVideoTitle}
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  aria-label={t.eventVideoPlay}
                  className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300"
                >
                  <Image
                    src={videoThumbnailUrl(videoId)}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="object-cover transition-opacity group-hover:opacity-80"
                  />
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-orange-500/90 ring-1 ring-white/30 transition-transform group-hover:scale-110 group-focus-visible:scale-110"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="ml-1 h-7 w-7 fill-black"
                      focusable="false"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
