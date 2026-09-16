// components/Home/HomeSpotlight.tsx
//
// Section "événement" de la refonte accueil : UNE carte pour le tournoi
// courant/à venir (nom, dates, format, cash-prize si dispo, équipes X/Y, CTA)
// avec un panneau Twitch à droite. Live-aware : le lecteur Twitch s'affiche en
// grand quand la chaîne est en direct, sinon un teaser compact "prochain live".
//
// CE QUE LA CARTE ANNONCE EN PREMIER est décidé par `utils/home/spotlightLead`,
// pas ici : l'ordre live > imminent > complet > ouvert y est écrit une fois,
// pur et testé. La carte ne fait que l'habiller. Elle menait auparavant par
// « Complet » même à deux jours du coup d'envoi — pendant que son propre pied
// annonçait les matchs du vendredi.
//
// LES ÉQUIPES ONT QUITTÉ LA CARTE. Elles en occupaient le pied en REPLI du
// calendrier : les semaines où une journée est publiée, elles disparaissaient
// purement et simplement. Or « qui court » et « qui joue vendredi » ne sont pas
// deux réponses à la même question — la seconde ne remplace pas la première.
// La bande est donc devenue une section à part, sur toute la largeur de la
// page, où les blasons ont enfin la place qu'ils méritent.

import type { JSX } from 'react';
import Link from 'next/link';
import {
  type UpcomingTournament,
  // Même formateur que la carte tournoi : il était recopié ici, avec le même
  // bug de fuseau. Une seule copie, corrigée une fois.
  formatTournamentRange as formatRange,
} from '@/components/Home/HomeUpcomingTournament';
import { type TwitchLive } from '@/components/Home/useTwitchLive';
import HomeTeamsStrip from '@/components/Home/HomeTeamsStrip';
import HomeMatchdayStrip from '@/components/Home/HomeMatchdayStrip';
import { type HomeTeam } from '@/utils/home/loadHomeData';
import { type HomeMatchday } from '@/utils/home/loadNextMatchday';
import { spotlightLead } from '@/utils/home/spotlightLead';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

type HomeSpotlightProps = {
  tournament: UpcomingTournament | null;
  prizeCents: number | null;
  live: TwitchLive;
  /** Équipes engagées, rendues en bande pleine largeur sous la carte. */
  teams: HomeTeam[];
  /**
   * Les affiches de la prochaine journée (« vendredi, X contre Y à 20 h 30 »),
   * quand il y en a. Optionnel : la carte sait vivre sans.
   */
  matchday?: HomeMatchday | null;
  /**
   * L'horloge du rendu, en ISO, fabriquée par `getStaticProps`.
   *
   * POURQUOI PAS `new Date()` ICI : la page est statique (ISR 15 min). Un
   * `new Date()` dans le composant donnerait le build côté serveur et la
   * visite côté client — deux valeurs qui se contredisent dès qu'un minuit
   * passe entre les deux, et React le signale comme un écart d'hydratation.
   * Même discipline que `loadNextMatchday`, qui prend déjà son `now`.
   */
  now?: string | null;
};

function formatPrize(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function TwitchPanel({ live }: { live: TwitchLive }) {
  const t = useT(nsHomeV2);
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
  teams,
  matchday = null,
  now = null,
}: HomeSpotlightProps): JSX.Element | null {
  const t = useT(nsHomeV2);
  const locale = useLocale();

  if (!tournament) return null;

  const isRunning = tournament.status === 'running';
  const range = formatRange(tournament.startDate, tournament.endDate, locale);
  const detailHref = tournament.slug
    ? `/tournament/${tournament.slug}`
    : `/tournament/${tournament.id}`;
  const matchesHref = `${detailHref}/matches`;
  // « Complet » se DÉDUIT des places, comme dans le hero : le jour où une
  // équipe se désiste, la section réinvite d'elle-même. Un drapeau à lever à
  // la main resterait levé.
  const isFull =
    tournament.maxTeams != null && tournament.teamCount >= tournament.maxTeams;

  const lead = spotlightLead(
    {
      status: tournament.status,
      startDate: tournament.startDate,
      teamCount: tournament.teamCount,
      maxTeams: tournament.maxTeams,
    },
    // `now` absent (appel hors page d'accueil, test) : l'horloge locale fait
    // un repli honnête — on ne veut simplement pas en dépendre en production.
    now ? new Date(now) : new Date()
  );

  // La barre de progression ne sert QUE tant qu'il reste des places : c'est un
  // « dépêche-toi », pas une décoration. À 100 % elle répète « 8 / 8 » juste
  // au-dessus, et une fois le tournoi lancé elle ne veut plus rien dire.
  const pct =
    lead.kind === 'open' && tournament.maxTeams && tournament.maxTeams > 0
      ? Math.min(
          100,
          Math.round((tournament.teamCount / tournament.maxTeams) * 100)
        )
      : null;

  const startingChip =
    lead.kind === 'starting'
      ? lead.days === 0
        ? t.spotChipStarting_zero
        : lead.days === 1
          ? t.spotChipStarting_one
          : format(t.spotChipStarting_other, { days: lead.days })
      : null;

  const startingLead =
    lead.kind === 'starting'
      ? format(
          isFull
            ? lead.days === 0
              ? t.spotStartingLeadFull_zero
              : lead.days === 1
                ? t.spotStartingLeadFull_one
                : t.spotStartingLeadFull_other
            : lead.days === 0
              ? t.spotStartingLead_zero
              : lead.days === 1
                ? t.spotStartingLead_one
                : t.spotStartingLead_other,
          { days: lead.days, teams: tournament.teamCount }
        )
      : null;

  // Les trois portes de sortie. Elles ne disparaissent jamais quand il n'y a
  // plus de place — elles cessent seulement d'occuper le premier rang dès
  // qu'un coup d'envoi est en vue.
  const exits = (
    <>
      <Link
        href="/scrim"
        className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-[var(--color-violet-light)]/60 hover:bg-[var(--color-violet)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
      >
        {t.spotCtaScrim}
      </Link>
      <Link
        href="/rejoindre"
        className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-[var(--color-violet-light)]/60 hover:bg-[var(--color-violet)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
      >
        {t.spotCtaFindTeam}
      </Link>
      <Link
        href="/team/create"
        className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
      >
        {t.spotCtaCreateTeamNext}
      </Link>
    </>
  );

  return (
    <>
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
            {/* UNE puce, et une seule : celle qui dit l'état. Le format avait
              ici une seconde puce, alors qu'il est déjà une statistique trois
              lignes plus bas — « BO3 · finales en BO5 » s'affichait deux fois
              dans le même coup d'œil. */}
            <div className="flex flex-wrap gap-2">
              {isRunning ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
                  <span className="relative flex h-1.5 w-1.5" aria-hidden>
                    <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                  </span>
                  {t.spotChipLive}
                </span>
              ) : startingChip ? (
                <span className="inline-flex items-center rounded-full border border-[var(--color-green)]/45 bg-[var(--color-green)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-green-light)]">
                  {startingChip}
                </span>
              ) : lead.kind === 'full' ? (
                <span className="inline-flex items-center rounded-full border border-[var(--color-yellow)]/45 bg-[var(--color-yellow)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-yellow)]">
                  {t.spotChipFull}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-green-light)]">
                  {t.spotChipOpen}
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

            {/* L'accroche suit la décision. « Complet » ne constate plus une
              porte fermée à deux jours du coup d'envoi : dès qu'un début est
              en vue, la phrase compte les jours et les équipes. */}
            {startingLead && (
              <p className="mt-6 text-sm text-gray-200 md:text-base">
                {startingLead}
              </p>
            )}
            {lead.kind === 'full' && (
              <p className="mt-6 text-sm text-gray-300">{t.spotFullLead}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {/* Le bouton PLEIN va à l'action encore possible. Il reste des
                places, même à trois jours du départ : inscrire prime sur
                consulter. Plus de place : il ne reste qu'à regarder. */}
              {(lead.kind === 'open' ||
                (lead.kind === 'starting' && !isFull)) && (
                <Link
                  href="/team/create"
                  className="rounded-full bg-[var(--color-violet-cta)] px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 hover:bg-[var(--color-violet-deep)] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] motion-reduce:transform-none"
                >
                  {t.spotCtaRegister}
                </Link>
              )}
              {(lead.kind === 'live' ||
                (lead.kind === 'starting' && isFull)) && (
                <Link
                  href={matchesHref}
                  className="rounded-full bg-[var(--color-violet-cta)] px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 hover:bg-[var(--color-violet-deep)] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] motion-reduce:transform-none"
                >
                  {t.spotCtaSchedule}
                </Link>
              )}
              {lead.kind === 'starting' && !isFull && (
                <Link
                  href={matchesHref}
                  className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-[var(--color-violet-light)]/60 hover:bg-[var(--color-violet)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
                >
                  {t.spotCtaSchedule}
                </Link>
              )}
              {lead.kind === 'full' && exits}
              <Link
                href={detailHref}
                className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
              >
                {isRunning ? t.spotCtaView : t.spotCtaTeams}
              </Link>
            </div>

            {/* Second rang. Le tournoi démarre et il n'y a plus de place : celle
              qui arrive maintenant n'a plus rien à faire sur cette carte, sauf
              ici. La ligne est discrète — elle ne doit pas concurrencer le
              coup d'envoi, seulement ne pas manquer. */}
            {lead.kind === 'starting' && isFull && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                  {t.spotAsideLead}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">{exits}</div>
              </div>
            )}
          </div>

          <aside className="flex flex-col justify-center gap-3 border-t border-white/10 bg-black/20 p-6 md:border-l md:border-t-0 md:p-7">
            <TwitchPanel live={live} />
          </aside>

          {/* Pied de carte : CE QUI SE JOUE. Les affiches de la prochaine
            journée avec l'heure du coup d'envoi — c'est ce qu'on vient
            chercher ici un soir de match, et ça change toutes les semaines.
            Sans journée publiée, le pied s'efface : la carte est complète sans
            lui, et un squelette vide ne vaut pas mieux que rien. */}
          {matchday && (
            <HomeMatchdayStrip matchday={matchday} matchesHref={matchesHref} />
          )}
        </div>
      </section>

      {/* QUI COURT, sur toute la largeur de la page. Hors de la carte : le
        conteneur qui cadre le texte étranglait une bande dont le contenu est
        une suite de blasons — elle respire d'un bord à l'autre, et elle ne
        dépend plus de l'absence de calendrier pour exister. */}
      <HomeTeamsStrip teams={teams} />
    </>
  );
}
