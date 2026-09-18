// components/overlay/match/DayScheduleSource.tsx
//
// La source « matchs du jour » : le programme d'une journée, tel qu'il
// s'affiche dans OBS (plein cadre 1920×1080).
//
// RIEN QUE LES LIGNES. Ni panneau, ni titre, ni date, ni compteur : la régie
// pose la source sur sa propre scène, qui porte déjà l'habillage et le titre.
// Fond entièrement transparent ; une ombre portée sur le texte le garde
// lisible sur n'importe quel décor. Journée sans match = cadre vide.
//
// LA LARGEUR SUIT LA SOURCE. Une largeur fixe (1500 px, centrée) coupait les
// deux bords dès que la source OBS/Streamlabs était plus étroite que ça :
// l'horaire à gauche, la fin des noms à droite. Les NOMS ne sont jamais
// tronqués non plus : un nom d'équipe coupé ne se devine pas à l'antenne, il
// passe à la ligne.
//
// Gros caractères, aucune animation continue hormis le point « en direct »,
// aucun cadre ni trait de couleur. Les matchs terminés passent en retrait pour
// que l'œil aille à ce qui vient.

import { useT } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import type { OverlayDayResponse } from '@/pages/api/overlay/day';
import type { OverlayDayMatchView } from '@/utils/overlay/dayOverlay';
import { dayWindow } from '@/utils/overlay/dayOverlay';
import type { OverlayTeamView } from '@/utils/overlay/matchOverlay';
import { TeamLogo, hourLabel } from '@/components/overlay/match/MatchSources';

type Dict = typeof nsOverlay.fr;

function TeamCell({
  team,
  align,
  dim,
  t,
}: {
  team: OverlayTeamView | null;
  align: 'left' | 'right';
  dim: boolean;
  t: Dict;
}) {
  const name = team?.name?.trim() || t.dayTeamTbd;
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-3 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <TeamLogo team={team} size="sm" fallback={name} />
      <span
        className={`min-w-0 break-words text-3xl font-bold leading-tight ${
          dim && !team?.isWinner ? 'text-white/50' : 'text-white'
        } ${team ? '' : 'italic text-white/50'}`}
      >
        {name}
      </span>
    </div>
  );
}

function MatchLine({ match, t }: { match: OverlayDayMatchView; t: Dict }) {
  const final = match.phase === 'final';
  const live = match.phase === 'live';
  const time = hourLabel(match.scheduledAt ?? match.startedAt);

  return (
    <li className="flex items-center gap-5 py-3">
      <div className="shrink-0 text-3xl font-bold tabular-nums text-white">
        {time ?? '—'}
      </div>
      <TeamCell team={match.team1} align="right" dim={final} t={t} />
      <div className="flex w-24 shrink-0 flex-col items-center">
        {final || live ? (
          <span className="text-4xl font-black tabular-nums text-white">
            {match.team1?.score ?? 0}
            <span className="mx-2 text-white/30">:</span>
            {match.team2?.score ?? 0}
          </span>
        ) : (
          <span className="text-2xl font-black text-white/40">{t.vs}</span>
        )}
      </div>
      <TeamCell team={match.team2} align="left" dim={final} t={t} />
      <div className="flex shrink-0 justify-end empty:hidden">
        {live ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {t.matchPhaseLive}
          </span>
        ) : final ? (
          <span className="text-sm font-bold uppercase tracking-wider text-white/40">
            {t.matchPhaseFinal}
          </span>
        ) : match.format ? (
          <span className="text-sm font-bold uppercase tracking-wider text-white/50">
            {match.format.toUpperCase()}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function DayScheduleSource({
  payload,
  scale,
  limit,
}: {
  payload: OverlayDayResponse | null;
  scale: number;
  limit: number;
}) {
  const t = useT(nsOverlay);
  if (!payload) return null;

  const rows = dayWindow(payload.matches, payload.currentMatchId, limit);
  if (rows.length === 0) return null;

  return (
    <div className="flex h-full w-full items-center justify-center px-8">
      <ol
        className="flex w-full max-w-[1500px] origin-center flex-col gap-2 [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]"
        style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}
      >
        {rows.map((m) => (
          <MatchLine key={m.id} match={m} t={t} />
        ))}
      </ol>
    </div>
  );
}
