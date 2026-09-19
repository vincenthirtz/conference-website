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
// connues, une heure). Sans journée, HomeSpotlight retombe sur les équipes
// engagées — pas de squelette vide.

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

/** Un côté de l'affiche. `align` met les deux équipes en miroir. */
function MatchSide({
  team,
  align,
  dimmed,
}: {
  team: HomeTeam;
  align: 'start' | 'end';
  dimmed: boolean;
}): JSX.Element {
  return (
    <span
      className={`flex min-w-0 items-center gap-2 ${
        align === 'end' ? 'flex-row-reverse text-right' : 'text-left'
      }`}
    >
      <TeamAvatar
        name={team.name}
        shortName={team.shortName}
        logoUrl={team.logoUrl}
        size="sm"
      />
      <span
        className={`min-w-0 truncate text-[13px] font-semibold leading-tight transition-colors sm:text-sm ${
          dimmed ? 'text-gray-400' : 'text-white'
        }`}
      >
        {team.name}
      </span>
    </span>
  );
}

function MatchRow({ match }: { match: HomeMatchdayMatch }): JSX.Element {
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
  const dimmed = (teamId: string) =>
    isDone && !!match.winnerTeamId && match.winnerTeamId !== teamId;

  // Le nom accessible est RÉDIGÉ plutôt que déduit du contenu : lu tel quel,
  // « Chocomates 2 – 1 Eclypse 20:30 » ne dit pas qui affronte qui.
  const label = hasScore
    ? format(t.matchdayMatchAriaScore, {
        home: match.team1.name,
        away: match.team2.name,
        score1: match.team1Score as number,
        score2: match.team2Score as number,
        time,
      })
    : format(t.matchdayMatchAria, {
        home: match.team1.name,
        away: match.team2.name,
        time,
      });

  return (
    <li>
      <Link
        href={`/match/${match.id}`}
        aria-label={label}
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 transition-colors hover:border-[var(--color-violet-light)]/50 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] sm:gap-3 sm:px-4"
      >
        <MatchSide
          team={match.team1}
          align="end"
          dimmed={dimmed(match.team1.id)}
        />

        <span className="flex shrink-0 flex-col items-center gap-1">
          {hasScore ? (
            <span className="text-base font-extrabold tabular-nums text-white sm:text-lg">
              <span className={dimmed(match.team1.id) ? 'text-gray-400' : ''}>
                {match.team1Score}
              </span>
              <span className="mx-1 text-gray-400" aria-hidden>
                –
              </span>
              <span className={dimmed(match.team2.id) ? 'text-gray-400' : ''}>
                {match.team2Score}
              </span>
            </span>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[13px] font-bold tabular-nums text-white">
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
          dimmed={dimmed(match.team2.id)}
        />
      </Link>
    </li>
  );
}

export default function HomeMatchdayStrip({
  matchday,
  following = null,
  matchesHref,
}: {
  matchday: HomeMatchday;
  /** La journée d'APRÈS, en résumé d'une ligne par affiche. */
  following?: HomeMatchday | null;
  matchesHref: string;
}): JSX.Element | null {
  const t = useT(nsHomeV2);
  const locale = useLocale();

  if (!matchday.matches.length) return null;

  // Le jour se formate depuis un INSTANT réel (le premier coup d'envoi) plutôt
  // que depuis la chaîne `YYYY-MM-DD` : c'est la seule façon d'être sûr que le
  // jour affiché est celui qu'on a calculé à Paris, quel que soit le fuseau du
  // serveur de rendu.
  const dayLabel = formatSiteDate(matchday.matches[0].scheduledAt, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const hidden = matchday.totalCount - matchday.matches.length;

  return (
    // `md:col-span-2` : la bande traverse les deux colonnes de la carte
    // (infos à gauche, Twitch à droite) au lieu de se ranger dans l'une d'elles.
    <div className="border-t border-white/10 bg-black/20 py-6 md:col-span-2">
      <div className="mb-4 flex flex-col items-center gap-0.5 px-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
          {dayLabel}
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

      <ul className="grid list-none grid-cols-1 gap-2 px-4 sm:px-6 lg:grid-cols-2">
        {matchday.matches.map((m) => (
          <MatchRow key={m.id} match={m} />
        ))}
      </ul>

      {following && <FollowingDay matchday={following} />}

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
 * La journée SUIVANTE, en retrait : une ligne par affiche, heure en tête.
 *
 * Volontairement plus pauvre que la journée qui vient — même poids visuel, et
 * on ne saurait plus laquelle se joue ce soir. Elle répond à une seule
 * question : quand rejoue-t-on, et contre qui.
 */
function FollowingDay({ matchday }: { matchday: HomeMatchday }): JSX.Element {
  const t = useT(nsHomeV2);
  const locale = useLocale();
  const dayLabel = formatSiteDate(matchday.matches[0].scheduledAt, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const hidden = matchday.totalCount - matchday.matches.length;

  return (
    <div className="mt-5 border-t border-white/5 px-4 pt-4 sm:px-6">
      <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        {format(t.matchdayNextDay, { day: dayLabel })}
      </p>
      <ul className="mx-auto grid max-w-2xl list-none grid-cols-1 gap-1 sm:grid-cols-2">
        {matchday.matches.map((m) => (
          <li key={m.id}>
            <Link
              href={`/match/${m.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              <span className="shrink-0 tabular-nums font-semibold text-gray-200">
                {formatSiteDate(m.scheduledAt, locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="truncate">
                {m.team1.shortName || m.team1.name}
                <span className="mx-1 text-gray-500" aria-hidden>
                  –
                </span>
                {m.team2.shortName || m.team2.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-1 text-center text-[11px] text-gray-500">
          {format(hidden > 1 ? t.matchdayMore_other : t.matchdayMore_one, {
            count: hidden,
          })}
        </p>
      )}
    </div>
  );
}
