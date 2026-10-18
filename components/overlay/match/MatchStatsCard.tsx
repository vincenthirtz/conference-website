// components/overlay/match/MatchStatsCard.tsx
//
// La carte « avant-match » de la source `maps` : ce qu'elle montre tant
// qu'aucune map n'est choisie, au lieu d'un cadre vide (constaté le 2026-10-18
// sur la Cup 2026). Les données viennent de
// `GET /api/overlay/match/<uuid>/stats` (utils/overlay/matchStatsOverlay.ts) :
// tout y est déjà calculé AVANT ce match et vu depuis lui — `team1` est
// l'équipe de gauche du tableau de score.
//
// DEUX PANNEAUX CÔTE À CÔTE plutôt qu'une colonne : un pool de soirée compte
// onze maps, et empilé sous le comparatif il montait jusqu'au milieu du cadre.
// Mêmes partis pris que les autres sources : fond sombre opaque, gros texte,
// aucune animation, noms jamais tronqués. Une ligne sans donnée se tait
// plutôt que d'afficher des zéros qui ressemblent à des résultats.

import type { ReactNode } from 'react';
import { format } from '@/lib/i18n/useT';
import type nsOverlay from '@/lib/i18n/locales/fr/overlay';
import type {
  OverlayMatchStats,
  OverlayStatsHeroBan,
  OverlayStatsRecord,
  OverlayStatsStanding,
} from '@/utils/overlay/matchStatsOverlay';
import type {
  OverlayMatchView,
  OverlayTeamView,
} from '@/utils/overlay/matchOverlay';
import { formatPlayDateShort } from '@/utils/maps/poolScope';
import { TeamLogo } from '@/components/overlay/match/MatchSources';
import {
  FormChips,
  formatMapDiff,
} from '@/components/overlay/match/StandingsSource';

type Dict = typeof nsOverlay.fr;

function teamLabel(team: OverlayTeamView | null, t: Dict): string {
  return team?.name?.trim() || t.matchTeamFallback;
}

function rankLabel(s: OverlayStatsStanding, t: Dict): string {
  return s.rank === 1
    ? t.statsRankFirst
    : format(t.statsRank, { rank: s.rank });
}

function recordLabel(s: OverlayStatsStanding, t: Dict): string {
  return s.draws > 0
    ? format(t.statsRecordDraws, {
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
      })
    : format(t.statsRecord, { wins: s.wins, losses: s.losses });
}

function mapRecordLabel(r: OverlayStatsRecord, t: Dict): string | null {
  if (r.wins + r.losses === 0) return null;
  return format(t.statsMapRecord, { wins: r.wins, losses: r.losses });
}

function PanelHeader({
  accent,
  children,
}: {
  accent: string;
  children: ReactNode;
}) {
  return (
    <div
      className="px-5 py-2 text-xs font-bold uppercase tracking-[0.25em] text-black"
      style={{ backgroundColor: accent }}
    >
      {children}
    </div>
  );
}

/** Une ligne du comparatif : valeur gauche · libellé · valeur droite. */
function CompareRow({
  label,
  left,
  right,
  caption,
}: {
  label: string;
  left: ReactNode;
  right: ReactNode;
  caption?: string | null;
}) {
  return (
    <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-2.5">
      <div className="flex justify-center text-2xl font-black tabular-nums text-white">
        {left}
      </div>
      <div className="flex w-40 flex-col items-center text-center">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
          {label}
        </span>
        {caption && (
          <span className="mt-0.5 text-sm font-semibold tabular-nums text-white/70">
            {caption}
          </span>
        )}
      </div>
      <div className="flex justify-center text-2xl font-black tabular-nums text-white">
        {right}
      </div>
    </li>
  );
}

function BansList({ bans, t }: { bans: OverlayStatsHeroBan[]; t: Dict }) {
  if (bans.length === 0) return <span className="text-white/30">—</span>;
  return (
    <span className="flex flex-col items-center gap-0.5 text-lg font-bold leading-tight">
      {bans.map((b) => (
        <span key={b.hero}>
          {format(t.statsHeroBanCount, { name: b.name, count: b.count })}
        </span>
      ))}
    </span>
  );
}

function poolTitle(
  stats: OverlayMatchStats,
  match: OverlayMatchView,
  t: Dict
): string {
  const { scope, date } = stats.pool;
  if (scope === 'date' && date) {
    return format(t.statsPoolDate, { date: formatPlayDateShort(date) });
  }
  if (scope === 'round' && match.roundName) {
    return format(t.statsPoolRound, { round: match.roundName });
  }
  if (scope === 'tournament') return t.statsPoolTournament;
  return t.statsPoolCatalog;
}

export function MatchStatsCard({
  match,
  stats,
  accent,
  t,
}: {
  match: OverlayMatchView;
  stats: OverlayMatchStats;
  accent: string;
  t: Dict;
}) {
  const s1 = stats.team1;
  const s2 = stats.team2;
  const h2h = stats.headToHead;
  const hasBans =
    stats.heroBans.team1.length > 0 || stats.heroBans.team2.length > 0;
  const meetingsCaption = h2h.meetings
    .map((m) =>
      [
        m.roundName,
        m.team1Score != null && m.team2Score != null
          ? `${m.team1Score}–${m.team2Score}`
          : null,
      ]
        .filter(Boolean)
        .join(' ')
    )
    .filter(Boolean)
    .join(' · ');
  const short1 = match.team1?.shortName || teamLabel(match.team1, t);
  const short2 = match.team2?.shortName || teamLabel(match.team2, t);

  return (
    <div
      className="flex items-end gap-6 [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]"
      data-testid="match-stats-card"
    >
      {/* ── Comparatif ── */}
      <div className="w-[40rem] overflow-hidden rounded-2xl border border-white/10 bg-black/85 shadow-2xl">
        <PanelHeader accent={accent}>
          {[t.statsTitle, stats.stageName].filter(Boolean).join(' · ')}
        </PanelHeader>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4">
          <TeamHead team={match.team1} t={t} />
          <div className="w-40 text-center text-3xl font-black text-white/30">
            {t.vs}
          </div>
          <TeamHead team={match.team2} t={t} />
        </div>
        <ul className="divide-y divide-white/5 border-t border-white/10">
          {(s1 || s2) && (
            <CompareRow
              label={t.statsRankLabel}
              left={s1 ? <RankValue s={s1} t={t} /> : '—'}
              right={s2 ? <RankValue s={s2} t={t} /> : '—'}
            />
          )}
          {(s1 || s2) && (
            <CompareRow
              label={t.statsRecordLabel}
              left={s1 ? recordLabel(s1, t) : '—'}
              right={s2 ? recordLabel(s2, t) : '—'}
            />
          )}
          {(s1 || s2) && (
            <CompareRow
              label={t.statsMapDiffLabel}
              left={s1 ? formatMapDiff(s1.mapDiff) : '—'}
              right={s2 ? formatMapDiff(s2.mapDiff) : '—'}
            />
          )}
          {((s1?.form.length ?? 0) > 0 || (s2?.form.length ?? 0) > 0) && (
            <CompareRow
              label={t.statsFormLabel}
              left={s1 ? <FormChips form={s1.form} t={t} /> : '—'}
              right={s2 ? <FormChips form={s2.form} t={t} /> : '—'}
            />
          )}
          {h2h.meetings.length > 0 ? (
            <CompareRow
              label={t.statsHeadToHeadLabel}
              caption={meetingsCaption}
              left={h2h.team1Wins}
              right={h2h.team2Wins}
            />
          ) : (
            <li className="px-5 py-2.5 text-center text-lg font-semibold text-white/70">
              {t.statsFirstMeeting}
            </li>
          )}
          {hasBans && (
            <CompareRow
              label={t.statsHeroBansLabel}
              left={<BansList bans={stats.heroBans.team1} t={t} />}
              right={<BansList bans={stats.heroBans.team2} t={t} />}
            />
          )}
        </ul>
      </div>

      {/* ── Pool du soir ── */}
      {stats.pool.maps.length > 0 && (
        <div className="w-[30rem] overflow-hidden rounded-2xl border border-white/10 bg-black/85 shadow-2xl">
          <PanelHeader accent={accent}>
            {poolTitle(stats, match, t)}
          </PanelHeader>
          <div className="grid grid-cols-[4.5rem_1fr_4.5rem] gap-3 px-5 pt-3 pb-1 text-center text-xs font-bold uppercase tracking-[0.15em] text-white/50">
            <span className="break-words">{short1}</span>
            <span />
            <span className="break-words">{short2}</span>
          </div>
          <ul className="divide-y divide-white/5">
            {stats.pool.maps.map((m) => {
              const left = mapRecordLabel(m.team1, t);
              const right = mapRecordLabel(m.team2, t);
              return (
                <li
                  key={m.name}
                  className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-3 px-5 py-2"
                >
                  <span
                    className={`text-center text-lg font-bold tabular-nums ${
                      left ? 'text-white' : 'text-white/30'
                    }`}
                  >
                    {left ?? '—'}
                  </span>
                  <span className="text-center text-lg font-semibold leading-tight text-white">
                    {m.name}
                  </span>
                  <span
                    className={`text-center text-lg font-bold tabular-nums ${
                      right ? 'text-white' : 'text-white/30'
                    }`}
                  >
                    {right ?? '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function TeamHead({ team, t }: { team: OverlayTeamView | null; t: Dict }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <TeamLogo team={team} size="sm" fallback={t.matchTeamFallback} />
      <span className="break-words text-2xl font-black leading-tight text-white">
        {teamLabel(team, t)}
      </span>
    </div>
  );
}

function RankValue({ s, t }: { s: OverlayStatsStanding; t: Dict }) {
  return (
    <span className="flex items-center gap-2">
      {rankLabel(s, t)}
      {s.disqualified && (
        <span className="rounded-md bg-red-600 px-2 py-0.5 text-sm font-black uppercase tracking-wider text-white">
          {t.standingsDisqualified}
        </span>
      )}
    </span>
  );
}
