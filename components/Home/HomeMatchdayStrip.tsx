// components/Home/HomeMatchdayStrip.tsx
//
// LES AFFICHES DE LA PROCHAINE JOURNÉE — le pied de la carte « prochain
// rendez-vous » (HomeSpotlight).
//
// Il remplace la bande des équipes engagées, qui disait quelque chose de vrai
// mais d'immobile : la même ligne de logos en août et la veille d'une finale.
// « Vendredi 18 septembre — Chocomates contre Eclypse à 20 h 30 » est ce qu'on
// vient chercher sur la home un soir de match, et c'est aussi ce qui donne
// envie de revenir.
//
// PARTI PRIS. Une affiche se lit en miroir : l'équipe de gauche alignée à
// droite, celle de droite alignée à gauche, et au centre la seule information
// qui change avec le temps — l'heure du coup d'envoi, puis le score. Cette
// colonne centrale est la même du haut en bas de la liste, ce qui permet de
// balayer les horaires d'un regard sans lire les noms.
//
// Le bloc ne s'affiche jamais à moitié : `loadNextMatchday` ne renvoie une
// journée que si elle contient au moins une affiche complète (deux équipes
// connues, une heure). Sans journée, HomeSpotlight n'affiche rien — pas de
// squelette vide.

import type { JSX } from 'react';
import Link from 'next/link';
import TeamAvatar from '@/components/Team/TeamAvatar';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { formatSiteDate } from '@/utils/timezone';
import type {
  HomeMatchday,
  HomeMatchdayMatch,
} from '@/utils/home/loadNextMatchday';
import type { HomeTeam } from '@/utils/home/loadHomeData';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

/**
 * Un côté de l'affiche. `align` met les deux équipes en miroir. `team` nul =
 * pas encore connue (finaliste à venir) : « À déterminer », sans blason.
 */
function MatchSide({
  team,
  align,
  dimmed,
  large,
}: {
  team: HomeTeam | null;
  align: 'start' | 'end';
  dimmed: boolean;
  large: boolean;
}): JSX.Element {
  const t = useT(nsHomeV2);
  const nameClass = large
    ? 'text-base sm:text-lg font-bold'
    : 'text-[13px] sm:text-sm font-semibold';
  // Grand format, sur mobile : le blason AU-DESSUS du nom, qui peut passer à
  // la ligne. Côte à côte, à 390 px, « LVN EMBERS » devenait « LV… » — un
  // soir de finales, sur l'affiche qu'on vient voir.
  const layout = large
    ? `flex-col gap-2 text-center sm:gap-3 ${
        align === 'end'
          ? 'sm:flex-row-reverse sm:text-right'
          : 'sm:flex-row sm:text-left'
      }`
    : `gap-2 ${align === 'end' ? 'flex-row-reverse text-right' : 'text-left'}`;
  return (
    <span className={`flex min-w-0 items-center ${layout}`}>
      {team ? (
        <TeamAvatar
          name={team.name}
          shortName={team.shortName}
          logoUrl={team.logoUrl}
          size={large ? 'md' : 'sm'}
        />
      ) : (
        <span
          aria-hidden
          className={`flex shrink-0 items-center justify-center rounded-full border border-dashed border-white/25 font-bold text-gray-400 ${
            large ? 'h-12 w-12 text-base' : 'h-8 w-8 text-xs'
          }`}
        >
          ?
        </span>
      )}
      <span
        className={`min-w-0 leading-tight transition-colors ${
          large ? 'max-w-full text-balance break-words sm:truncate' : 'truncate'
        } ${nameClass} ${
          !team
            ? 'italic text-gray-400'
            : dimmed
              ? 'text-gray-400'
              : 'text-white'
        }`}
      >
        {team?.name ?? t.matchdayTbd}
      </span>
    </span>
  );
}

function MatchRow({
  match,
  showRound,
  large,
}: {
  match: HomeMatchdayMatch;
  /** Nommer la manche sur l'affiche (finales, journée à manches mêlées). */
  showRound: boolean;
  /** Journée de une ou deux affiches : cartes agrandies. */
  large: boolean;
}): JSX.Element {
  const t = useT(nsHomeV2);
  const locale = useLocale();

  const time = formatSiteDate(match.scheduledAt, locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const isLive = match.status === 'ongoing';
  const isDone = match.status === 'finished';
  // Le score ne s'affiche que s'il EXISTE : un match en cours dont aucune carte
  // n'est jouée garde son horaire plutôt qu'un « – » énigmatique.
  const hasScore =
    (isLive || isDone) && match.team1Score != null && match.team2Score != null;
  // Terminé : le perdant s'efface, sans qu'il faille lire les chiffres pour
  // savoir qui l'emporte. Tant que rien n'est joué, les deux sont à égalité.
  const dimmed = (team: HomeTeam | null) =>
    isDone && !!team && !!match.winnerTeamId && match.winnerTeamId !== team.id;
  const home = match.team1?.name ?? t.matchdayTbd;
  const away = match.team2?.name ?? t.matchdayTbd;
  const round = showRound ? match.roundName : null;

  // Le nom accessible est RÉDIGÉ plutôt que déduit du contenu : lu tel quel,
  // « Chocomates 2 – 1 Eclypse 20:30 » ne dit pas qui affronte qui.
  const matchLabel = hasScore
    ? format(t.matchdayMatchAriaScore, {
        home,
        away,
        score1: match.team1Score as number,
        score2: match.team2Score as number,
        time,
      })
    : format(t.matchdayMatchAria, { home, away, time });
  const label = round ? `${round} : ${matchLabel}` : matchLabel;

  return (
    <li>
      <Link
        prefetch={false}
        href={`/match/${match.id}`}
        aria-label={label}
        className={`grid grid-cols-[1fr_auto_1fr] items-center rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-[var(--color-violet-light)]/50 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] ${
          large
            ? 'gap-x-3 gap-y-3 px-4 py-5 sm:gap-x-4 sm:px-6'
            : 'gap-2 px-3 py-3 sm:gap-3 sm:px-4'
        }`}
      >
        {round && (
          <span
            className={`col-span-3 text-center font-bold uppercase tracking-[0.18em] text-[var(--color-violet-light)] ${
              large ? 'text-xs sm:text-sm' : 'text-[10px]'
            }`}
          >
            {round}
          </span>
        )}

        <MatchSide
          team={match.team1}
          align="end"
          dimmed={dimmed(match.team1)}
          large={large}
        />

        <span className="flex shrink-0 flex-col items-center gap-1">
          {hasScore ? (
            <span
              className={`font-extrabold tabular-nums text-white ${
                large ? 'text-2xl sm:text-3xl' : 'text-base sm:text-lg'
              }`}
            >
              <span className={dimmed(match.team1) ? 'text-gray-400' : ''}>
                {match.team1Score}
              </span>
              <span className="mx-1 text-gray-400" aria-hidden>
                –
              </span>
              <span className={dimmed(match.team2) ? 'text-gray-400' : ''}>
                {match.team2Score}
              </span>
            </span>
          ) : (
            <span
              className={`rounded-full border border-white/10 bg-white/5 font-bold tabular-nums text-white ${
                large
                  ? 'px-3.5 py-1.5 text-base sm:text-lg'
                  : 'px-2.5 py-1 text-[13px]'
              }`}
            >
              {time}
            </span>
          )}

          {isLive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
              <span className="relative flex h-1.5 w-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
              </span>
              {t.matchdayLive}
            </span>
          )}
          {isDone && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {t.matchdayFinished}
            </span>
          )}
        </span>

        <MatchSide
          team={match.team2}
          align="start"
          dimmed={dimmed(match.team2)}
          large={large}
        />
      </Link>
    </li>
  );
}

/** Au plus autant d'affiches : la journée se montre en grandes cartes (finales). */
export const LARGE_MATCHDAY_MAX = 2;

/**
 * Nommer la manche sur les affiches : toujours hors phase (finales), et
 * quand la journée mêle plusieurs manches. Une journée de saison, toute en
 * « J7 », ne le répète pas sur chaque carte. PURE.
 */
export function shouldShowRound(
  match: HomeMatchdayMatch,
  day: HomeMatchdayMatch[]
): boolean {
  if (!match.roundName) return false;
  if (match.outOfStage) return true;
  return new Set(day.map((m) => m.roundName ?? '')).size > 1;
}

export default function HomeMatchdayStrip({
  matchday,
  following = null,
  matchesHref,
}: {
  matchday: HomeMatchday;
  /** La journée d'APRÈS, affichée comme celle du jour — mêmes affiches. */
  following?: HomeMatchday | null;
  matchesHref: string;
}): JSX.Element | null {
  const t = useT(nsHomeV2);

  if (!matchday.matches.length) return null;

  const hidden = matchday.totalCount - matchday.matches.length;

  return (
    // `md:col-span-2` : la bande traverse les deux colonnes de la carte
    // (infos à gauche, Twitch à droite) au lieu de se ranger dans l'une d'elles.
    <div className="border-t border-white/10 bg-black/20 py-6 md:col-span-2">
      <DaySection matchday={matchday} />

      {/* La journée d'après, rendue À L'IDENTIQUE : mêmes affiches, mêmes
          blasons. Elle a d'abord été un résumé d'une ligne par match — deux
          traitements pour la même information, et l'œil ne s'y retrouvait
          pas. Seul le titre la distingue (« Puis vendredi 25 septembre »). */}
      {following && following.matches.length > 0 && (
        <DaySection matchday={following} following />
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-6 text-center">
        {hidden > 0 && (
          <span className="text-xs text-gray-400">
            {format(hidden > 1 ? t.matchdayMore_other : t.matchdayMore_one, {
              count: hidden,
            })}
          </span>
        )}
        <Link
          href={matchesHref}
          className="inline-flex items-center gap-1 rounded-full text-xs font-semibold text-[var(--color-green-light)] transition hover:text-[var(--color-green)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
        >
          {t.matchdayAll}
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Une journée : son titre, le nombre d'affiches, puis les affiches.
 *
 * Le jour se formate depuis un INSTANT réel (le premier coup d'envoi) plutôt
 * que depuis la chaîne `YYYY-MM-DD` : c'est la seule façon d'être sûr que le
 * jour affiché est celui qu'on a calculé à Paris, quel que soit le fuseau du
 * serveur de rendu.
 *
 * `following` ne change que le titre et l'espacement — pas les affiches : la
 * journée d'après se lit de la même façon que celle du jour.
 */
function DaySection({
  matchday,
  following = false,
}: {
  matchday: HomeMatchday;
  following?: boolean;
}): JSX.Element {
  const t = useT(nsHomeV2);
  const locale = useLocale();

  const dayLabel = formatSiteDate(matchday.matches[0].scheduledAt, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const hidden = matchday.totalCount - matchday.matches.length;
  const large = matchday.matches.length <= LARGE_MATCHDAY_MAX;

  return (
    <div className={following ? 'mt-6 border-t border-white/5 pt-6' : ''}>
      <div className="mb-4 flex flex-col items-center gap-0.5 px-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
          {following ? format(t.matchdayNextDay, { day: dayLabel }) : dayLabel}
        </p>
        <p className="text-balance text-sm font-semibold text-gray-200 md:text-base">
          {format(
            matchday.totalCount > 1
              ? t.matchdayTitle_other
              : t.matchdayTitle_one,
            { count: matchday.totalCount }
          )}
        </p>
      </div>

      <ul
        className={`grid list-none grid-cols-1 px-4 sm:px-6 lg:grid-cols-2 ${
          large ? 'gap-3' : 'gap-2'
        }`}
      >
        {matchday.matches.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            showRound={shouldShowRound(m, matchday.matches)}
            large={large}
          />
        ))}
      </ul>

      {following && hidden > 0 && (
        <p className="mt-2 text-center text-xs text-gray-400">
          {format(hidden > 1 ? t.matchdayMore_other : t.matchdayMore_one, {
            count: hidden,
          })}
        </p>
      )}
    </div>
  );
}
