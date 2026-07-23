// components/Home/HomeSpotlight.tsx
//
// Section "événement" de la refonte accueil : UNE carte pour le tournoi
// courant/à venir (nom, dates, format, cash-prize si dispo, équipes X/Y +
// barre de progression, CTA) avec un panneau Twitch à droite. Live-aware : le
// lecteur Twitch s'affiche en grand quand la chaîne est en direct, sinon un
// teaser compact "prochain live" + lien.

import type { JSX } from 'react';
import Link from 'next/link';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import { type TwitchLive } from '@/components/Home/useTwitchLive';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

type HomeSpotlightProps = {
  tournament: UpcomingTournament | null;
  prizeCents: number | null;
  live: TwitchLive;
};

function formatRange(start: string | null, end: string | null, locale: string) {
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const fmtFull = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
  if (!endDate || endDate.getTime() === startDate.getTime()) {
    return fmtFull.format(startDate);
  }
  const sameMonth =
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear();
  if (sameMonth) {
    return `${startDate.getDate()} – ${fmtFull.format(endDate)}`;
  }
  const fmtShort = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  });
  return `${fmtShort.format(startDate)} → ${fmtFull.format(endDate)}`;
}

function formatPrize(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function TwitchPanel({ live }: { live: TwitchLive }) {
  const t = useT('homeV2');
  const locale = useLocale();
  const channelUrl = `https://www.twitch.tv/${live.channel}`;

  if (live.live && live.parent) {
    const playerSrc = `https://player.twitch.tv/?channel=${live.channel}&parent=${live.parent}&muted=true`;
    return (
      <div className="flex flex-col gap-3">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
          {t.spotLiveNow}
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
          <iframe
            src={playerSrc}
            title={t.spotLiveIframeTitle}
            allowFullScreen
            allow="autoplay; fullscreen"
            loading="lazy"
            className="absolute inset-0 h-full w-full"
          />
        </div>
        {live.title && <p className="text-sm text-gray-200">{live.title}</p>}
        {typeof live.viewerCount === 'number' && (
          <p className="text-xs text-gray-400">
            {format(
              live.viewerCount > 1 ? t.spotViewers_other : t.spotViewers_one,
              { count: live.viewerCount.toLocaleString(locale) }
            )}
          </p>
        )}
      </div>
    );
  }

  // Teaser compact "prochain live".
  return (
    <div className="flex flex-col gap-3">
      <Link
        href={channelUrl}
        target="_blank"
        rel="noreferrer"
        className="group relative grid aspect-video place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(70%_80%_at_50%_40%,rgba(166,46,219,0.35),transparent_70%),linear-gradient(160deg,#1a1230,#0c1a12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
      >
        <span className="absolute left-3 top-3 text-xs font-semibold tracking-wide text-gray-300">
          {t.spotTwitchHandle}
        </span>
        <span className="grid h-14 w-14 place-items-center rounded-full border border-white/25 bg-white/10 backdrop-blur transition-transform duration-300 group-hover:scale-110 motion-reduce:transform-none">
          <svg
            viewBox="0 0 24 24"
            className="ml-0.5 h-6 w-6 fill-white"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </Link>
      <p className="text-center text-sm text-gray-300">
        {t.spotNextLive}{' '}
        <span className="text-[var(--color-green-light)]">
          {t.spotNextLiveHint}
        </span>
      </p>
    </div>
  );
}

export default function HomeSpotlight({
  tournament,
  prizeCents,
  live,
}: HomeSpotlightProps): JSX.Element | null {
  const t = useT('homeV2');
  const locale = useLocale();

  if (!tournament) return null;

  const isRunning = tournament.status === 'running';
  const range = formatRange(tournament.startDate, tournament.endDate, locale);
  const detailHref = tournament.slug
    ? `/tournament/${tournament.slug}`
    : `/tournament/${tournament.id}`;
  const pct =
    tournament.maxTeams && tournament.maxTeams > 0
      ? Math.min(
          100,
          Math.round((tournament.teamCount / tournament.maxTeams) * 100)
        )
      : null;

  return (
    <section className="container mx-auto mt-16 px-4 md:mt-20 md:px-0">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
            {t.spotEyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            {t.spotTitle}
          </h2>
        </div>
        <Link
          href={detailHref}
          className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--color-green-light)] transition hover:text-[var(--color-green)] sm:inline-flex"
        >
          {t.spotSeeTournament}
          <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="card-brand grid grid-cols-1 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-base)] md:grid-cols-[1.15fr_0.85fr]">
        <div className="relative p-6 md:p-8">
          <div className="flex flex-wrap gap-2">
            {isRunning ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
                <span className="relative flex h-1.5 w-1.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                </span>
                {t.spotChipLive}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-green-light)]">
                {t.spotChipOpen}
              </span>
            )}
            {tournament.format && (
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-300">
                {tournament.format}
              </span>
            )}
          </div>

          <h3 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-white md:text-3xl">
            {tournament.name}
          </h3>
          {range && (
            <p className="mt-1 text-sm text-gray-300 md:text-base">{range}</p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {tournament.format && (
              <div className="border-l-2 border-[var(--color-violet)]/50 pl-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-gray-500">
                  {t.spotFactFormat}
                </div>
                <div className="mt-0.5 text-base font-extrabold text-white">
                  {tournament.format}
                </div>
              </div>
            )}
            {prizeCents != null && (
              <div className="border-l-2 border-[var(--color-violet)]/50 pl-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-gray-500">
                  {t.spotFactPrize}
                </div>
                <div className="mt-0.5 text-base font-extrabold tabular-nums text-white">
                  {formatPrize(prizeCents, locale)}
                </div>
              </div>
            )}
            {tournament.maxTeams != null && (
              <div className="border-l-2 border-[var(--color-violet)]/50 pl-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-gray-500">
                  {t.spotFactTeams}
                </div>
                <div className="mt-0.5 text-base font-extrabold tabular-nums text-white">
                  {tournament.teamCount}
                  <span className="font-semibold text-gray-400">
                    {' '}
                    / {tournament.maxTeams}
                  </span>
                </div>
              </div>
            )}
          </div>

          {pct != null && (
            <div className="mt-4">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={format(t.spotProgressAria, { pct })}
              >
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {!isRunning && (
              <Link
                href="/team/create"
                className="rounded-full bg-[var(--color-violet)] px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 hover:bg-[var(--color-violet-deep)] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] motion-reduce:transform-none"
              >
                {t.spotCtaRegister}
              </Link>
            )}
            <Link
              href={detailHref}
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
            >
              {isRunning ? t.spotCtaView : t.spotCtaTeams}
            </Link>
          </div>
        </div>

        <aside className="flex flex-col justify-center gap-3 border-t border-white/10 bg-black/20 p-6 md:border-l md:border-t-0 md:p-7">
          <TwitchPanel live={live} />
        </aside>
      </div>
    </section>
  );
}
