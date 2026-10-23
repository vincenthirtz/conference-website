// components/overlay/finals/FinalsSource.tsx
//
// La source « finales » : la petite et la grande finale de la soirée, en
// plein cadre 1920×1080. Le cousin habillé de « Matchs du jour » — même
// journée, mêmes données, mais une carte par finale au lieu d'une ligne.
//
// HIÉRARCHIE. La grande finale est la plus grande carte, filet or ; la petite
// finale, filet bronze. Ordre du programme (la petite se joue d'abord), pour
// que l'écran se lise comme la soirée.
//
// TROIS ÉTATS par carte, sans jamais masquer le score :
//   - à venir : l'heure du coup d'envoi au centre ;
//   - en direct : le score, et une pastille « En direct » ;
//   - terminé : le score, le perdant en retrait, et la place de chacune
//     (championnes / finalistes, 3e / 4e place). Un forfait passe par là aussi.
// Pas de « VS » : la scène de la régie porte déjà l'habillage.
//
// Les cartes ont leur propre fond (noir translucide) : posée sur n'importe
// quel décor, la source reste lisible. Fond de page transparent.

import type { CSSProperties } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import nsOverlayFinals from '@/lib/i18n/locales/fr/overlayFinals';
import type { OverlayDayResponse } from '@/utils/overlay/dayOverlay';
import type { OverlayTeamView } from '@/utils/overlay/matchOverlay';
import { hourLabel } from '@/components/overlay/match/MatchSources';
import {
  selectFinals,
  type FinalKind,
  type FinalMatch,
} from '@/components/overlay/finals/finalsRounds';

/** Phases et repli (`overlay`) + textes des finales (`overlayFinals`). */
type Dict = typeof nsOverlay.fr & typeof nsOverlayFinals.fr;

/** Or pour le titre, bronze pour la 3e place. */
export const FINAL_TONES: Record<FinalKind, string> = {
  grand: '#f2c94c',
  small: '#d4935b',
};

/** Tailles par carte : la grande finale domine. */
const SIZES: Record<
  FinalKind,
  { logo: number; name: string; score: string; place: string }
> = {
  grand: {
    logo: 136,
    name: 'text-5xl',
    score: 'text-8xl',
    place: 'text-xl',
  },
  small: {
    logo: 104,
    name: 'text-4xl',
    score: 'text-6xl',
    place: 'text-lg',
  },
};

function Logo({
  team,
  fallback,
  px,
}: {
  team: OverlayTeamView | null;
  fallback: string;
  px: number;
}) {
  // Carré fixe, `object-contain` : un logo large ou haut garde ses
  // proportions sans pousser les noms.
  const box: CSSProperties = { width: px, height: px };
  if (team?.logoUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: source OBS — next/image n'apporte rien et casse sur un logo distant
      <img
        src={team.logoUrl}
        alt=""
        style={box}
        className="shrink-0 object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
      />
    );
  }
  return (
    <div
      style={box}
      className="flex shrink-0 items-center justify-center rounded-2xl bg-white/10 text-3xl font-black text-white/80"
      aria-hidden="true"
    >
      {fallback.slice(0, 2).toUpperCase()}
    </div>
  );
}

/** La place gagnée, une fois la finale jouée. */
export function placeLabel(
  kind: FinalKind,
  isWinner: boolean,
  t: Dict
): string {
  if (kind === 'grand') return isWinner ? t.finalsChampions : t.finalsRunnersUp;
  return isWinner ? t.finalsThird : t.finalsFourth;
}

function TeamBlock({
  team,
  align,
  kind,
  settled,
  t,
}: {
  team: OverlayTeamView | null;
  align: 'left' | 'right';
  kind: FinalKind;
  /** Finale jouée ET vainqueure connue : places et retrait du perdant. */
  settled: boolean;
  t: Dict;
}) {
  const size = SIZES[kind];
  const name = team?.name?.trim() || t.dayTeamTbd;
  const winner = Boolean(team?.isWinner);
  const dim = settled && !winner;
  return (
    <div
      className={`flex min-w-0 items-center gap-6 ${
        align === 'right' ? 'flex-row-reverse text-right' : 'text-left'
      }`}
    >
      <Logo team={team} fallback={name} px={size.logo} />
      <div className="min-w-0">
        {/* Jamais tronqué : un nom coupé ne se devine pas à l'antenne. */}
        <div
          className={`break-words font-black leading-tight ${size.name} ${
            team
              ? dim
                ? 'text-white/45'
                : 'text-white'
              : 'italic text-white/50'
          }`}
        >
          {name}
        </div>
        {settled && team && (
          <div
            className={`mt-2 font-bold uppercase tracking-[0.2em] ${size.place}`}
            style={{
              color: winner ? FINAL_TONES[kind] : 'rgba(255,255,255,0.5)',
            }}
          >
            {placeLabel(kind, winner, t)}
          </div>
        )}
      </div>
    </div>
  );
}

function FinalCard({ final, t }: { final: FinalMatch; t: Dict }) {
  const { match, kind } = final;
  const tone = FINAL_TONES[kind];
  const size = SIZES[kind];
  const live = match.phase === 'live';
  const done = match.phase === 'final';
  const settled =
    done && Boolean(match.team1?.isWinner || match.team2?.isWinner);
  const time = hourLabel(match.scheduledAt ?? match.startedAt);
  const format = (match.format ?? '').trim().toUpperCase();

  return (
    <section
      data-final={kind}
      className="w-full overflow-hidden rounded-[28px] border-2 bg-black/80"
      style={{
        borderColor: live ? '#ef4444' : tone,
        boxShadow: `0 0 64px ${live ? 'rgba(239,68,68,0.35)' : `${tone}55`}, 0 24px 80px rgba(0,0,0,0.6)`,
      }}
    >
      <div className="flex items-center justify-between gap-6 px-12 pt-7">
        <span
          className={`font-black uppercase tracking-[0.3em] ${
            kind === 'grand' ? 'text-3xl' : 'text-2xl'
          }`}
          style={{ color: tone }}
        >
          {kind === 'grand' ? t.finalsGrand : t.finalsSmall}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {format && (
            <span className="rounded-full border border-white/20 px-4 py-1 text-lg font-bold tracking-wider text-white/80">
              {format}
            </span>
          )}
          {live ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-1 text-lg font-bold uppercase tracking-wider text-white">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
              {t.matchPhaseLive}
            </span>
          ) : done ? (
            <span className="rounded-full bg-white/10 px-4 py-1 text-lg font-bold uppercase tracking-wider text-white/70">
              {t.matchPhaseFinal}
            </span>
          ) : null}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-10 px-12 pb-10 pt-6">
        <TeamBlock
          team={match.team1}
          align="right"
          kind={kind}
          settled={settled}
          t={t}
        />
        <div className="flex min-w-[12rem] flex-col items-center">
          {live || done ? (
            <span
              className={`font-black leading-none tabular-nums text-white ${size.score}`}
            >
              {match.team1?.score ?? 0}
              <span className="mx-4 text-white/30">:</span>
              {match.team2?.score ?? 0}
            </span>
          ) : (
            <>
              <span className="text-lg font-bold uppercase tracking-[0.25em] text-white/60">
                {t.finalsKickoff}
              </span>
              <span
                className={`mt-1 font-black leading-none tabular-nums text-white ${size.score}`}
              >
                {time ?? '—'}
              </span>
            </>
          )}
        </div>
        <TeamBlock
          team={match.team2}
          align="left"
          kind={kind}
          settled={settled}
          t={t}
        />
      </div>
    </section>
  );
}

export function FinalsSource({
  payload,
  scale,
  header = true,
  preview = false,
}: {
  payload: OverlayDayResponse | null;
  scale: number;
  /** Bandeau « tournoi · Les finales » au-dessus des cartes. */
  header?: boolean;
  /** Aperçu dans un onglet : dire pourquoi le cadre est vide. */
  preview?: boolean;
}) {
  const t: Dict = { ...useT(nsOverlay), ...useT(nsOverlayFinals) };
  if (!payload) return null;

  const finals = selectFinals(payload.matches);
  if (finals.length === 0) {
    // Dans OBS, un cadre vide (rien à annoncer) ; en aperçu, la raison.
    return preview ? (
      <div className="flex h-full w-full items-center justify-center p-16">
        <p className="max-w-3xl rounded-2xl border border-white/15 bg-black/85 px-10 py-8 text-center text-2xl font-semibold text-white/80">
          {t.finalsNone.replace('{date}', payload.date)}
        </p>
      </div>
    ) : null;
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-16">
      <div
        className="flex w-full max-w-[1600px] origin-center flex-col gap-8 [text-shadow:0_2px_10px_rgba(0,0,0,0.85)]"
        style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}
      >
        {header && (
          <header className="text-center">
            {payload.tournament.name && (
              <p className="text-xl font-bold uppercase tracking-[0.4em] text-white/70">
                {payload.tournament.name}
              </p>
            )}
            <h1 className="mt-2 text-6xl font-black uppercase tracking-tight text-white">
              {finals.length > 1 ? t.finalsTitle : t.finalsTitleOne}
            </h1>
          </header>
        )}
        {finals.map((f) => (
          <FinalCard key={f.match.id} final={f} t={t} />
        ))}
      </div>
    </div>
  );
}
