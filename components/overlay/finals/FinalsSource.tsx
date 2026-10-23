// components/overlay/finals/FinalsSource.tsx
//
// La source « finales » : la petite et la grande finale de la soirée, une
// bande chacune. Le cousin habillé de « Matchs du jour » — même journée,
// mêmes données.
//
// UNE SCÈNE FIXE DE 1450×340. La source se pose dans l'emplacement que
// l'habillage de la régie lui réserve (2026-10-23) : elle se dessine toujours
// à cette taille, puis se met à l'échelle de la source navigateur sans jamais
// changer de proportions. Collée en 1450×340 dans OBS, elle est au pixel près.
// Ni titre (l'habillage le porte), ni halo autour des bandes : il serait coupé
// au bord de la source et déborderait sur l'habillage.
//
// HIÉRARCHIE. Ordre du programme (la petite finale se joue d'abord) ; la
// grande finale a la bande la plus haute, libellé or ; la petite, bronze.
//
// LE CADRE REPREND L'HABILLAGE : un filet du vert au violet, les couleurs des
// faisceaux du fond de la régie (« STARTING WOMEN'S CUP FOND 2 », mesurées sur
// l'image le 2026-10-23), dans tous les états — la pastille dit le direct.
//
// TROIS ÉTATS par bande, sans jamais masquer le score :
//   - à venir : l'heure du coup d'envoi au centre ;
//   - en direct : le score et une pastille rouge ;
//   - terminé : le score, le perdant en retrait, et la place de chacune
//     (championnes / finalistes, 3ᵉ / 4ᵉ place). Un forfait passe par là aussi.
// Pas de « VS » : l'habillage de la régie s'en charge.
//
// Les bandes ont leur propre fond (noir translucide) : la source reste lisible
// sur n'importe quel décor. Fond de page transparent.

import { useEffect, useState, type CSSProperties } from 'react';
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

/** L'emplacement réservé par l'habillage de la régie. */
export const FINALS_STAGE = { width: 1450, height: 340 } as const;

/** Or pour le titre, bronze pour la 3e place. */
export const FINAL_TONES: Record<FinalKind, string> = {
  grand: '#f2c94c',
  small: '#d4935b',
};

/**
 * Les faisceaux du fond de l'habillage : vert à gauche, violet à droite
 * (moyenne des 60 pixels les plus marqués de chacun, sur l'image).
 */
export const FRAME_COLORS = { green: '#5c8c68', purple: '#823aa8' } as const;

/**
 * Filet en dégradé SUR une bande translucide : un `border-image` ignore les
 * coins arrondis, et un dégradé sous le fond transparaîtrait dedans. Un calque
 * dont le masque ne garde que le contour.
 */
const FRAME_STYLE: CSSProperties = {
  padding: 2,
  background: `linear-gradient(90deg, ${FRAME_COLORS.green}, ${FRAME_COLORS.purple})`,
  WebkitMask:
    'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
  WebkitMaskComposite: 'xor',
  mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
};

/** Tailles par bande : la grande finale domine. `grow` = part de hauteur. */
const SIZES: Record<
  FinalKind,
  { grow: number; logo: number; name: string; score: string }
> = {
  grand: { grow: 172, logo: 92, name: 'text-[34px]', score: 'text-6xl' },
  small: { grow: 156, logo: 80, name: 'text-3xl', score: 'text-5xl' },
};

/**
 * Échelle qui fait tenir la scène dans la fenêtre, sans la déformer. 1 au
 * rendu serveur (et dans une source OBS réglée en 1450×340).
 */
function useFitScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () =>
      setScale(
        Math.min(
          window.innerWidth / FINALS_STAGE.width,
          window.innerHeight / FINALS_STAGE.height
        )
      );
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

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
        className="shrink-0 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
      />
    );
  }
  return (
    <div
      style={box}
      className="flex shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl font-black text-white/80"
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
      className={`flex min-w-0 items-center gap-5 ${
        align === 'right' ? 'flex-row-reverse text-right' : 'text-left'
      }`}
    >
      <Logo team={team} fallback={name} px={size.logo} />
      <div className="min-w-0">
        {/* Jamais tronqué : un nom coupé ne se devine pas à l'antenne. */}
        <div
          className={`break-words font-black leading-[1.05] ${size.name} ${
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
            className="mt-1 text-base font-bold uppercase tracking-[0.2em]"
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

function FinalBand({ final, t }: { final: FinalMatch; t: Dict }) {
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
      className="relative grid min-h-0 grid-cols-[200px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 overflow-hidden rounded-2xl px-6"
      style={{
        flex: `${size.grow} 1 0%`,
        // L'accent reste DANS la bande : un halo serait coupé au bord de la
        // source et déborderait sur l'habillage. Les lueurs se POSENT sur un
        // fond noir uniforme : en dégradé vers le noir, les côtés restaient
        // transparents à 80 % et le décor passait sous le nom de la manche.
        background: `linear-gradient(90deg, ${FRAME_COLORS.green}33 0%, transparent 26%, transparent 74%, ${FRAME_COLORS.purple}33 100%), rgba(0,0,0,0.82)`,
      }}
    >
      <span
        aria-hidden="true"
        data-finals-frame=""
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={FRAME_STYLE}
      />
      <div className="flex min-w-0 flex-col items-start gap-2">
        <span
          className="text-lg font-black uppercase leading-tight tracking-[0.16em]"
          style={{ color: tone }}
        >
          {kind === 'grand' ? t.finalsGrand : t.finalsSmall}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {format && (
            <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-sm font-bold tracking-wider text-white/80">
              {format}
            </span>
          )}
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-bold uppercase tracking-wider text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              {t.matchPhaseLive}
            </span>
          ) : done ? (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-bold uppercase tracking-wider text-white/70">
              {t.matchPhaseFinal}
            </span>
          ) : null}
        </span>
      </div>

      <TeamBlock
        team={match.team1}
        align="right"
        kind={kind}
        settled={settled}
        t={t}
      />
      <div className="flex min-w-[10rem] flex-col items-center">
        {live || done ? (
          <span
            className={`font-black leading-none tabular-nums text-white ${size.score}`}
          >
            {match.team1?.score ?? 0}
            <span className="mx-3 text-white/30">:</span>
            {match.team2?.score ?? 0}
          </span>
        ) : (
          <>
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/60">
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
    </section>
  );
}

export function FinalsSource({
  payload,
  preview = false,
}: {
  payload: OverlayDayResponse | null;
  /** Aperçu dans un onglet : dire pourquoi le cadre est vide. */
  preview?: boolean;
}) {
  const t: Dict = { ...useT(nsOverlay), ...useT(nsOverlayFinals) };
  const scale = useFitScale();
  if (!payload) return null;

  const finals = selectFinals(payload.matches);
  if (finals.length === 0 && !preview) return null;

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        data-finals-stage=""
        className="flex shrink-0 flex-col gap-3 [text-shadow:0_2px_8px_rgba(0,0,0,0.85)]"
        style={{
          width: FINALS_STAGE.width,
          height: FINALS_STAGE.height,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
        }}
      >
        {finals.length === 0 ? (
          // Dans OBS, un cadre vide (rien à annoncer) ; en aperçu, la raison.
          <p className="m-auto max-w-[1100px] rounded-2xl border border-white/15 bg-black/85 px-8 py-6 text-center text-2xl font-semibold text-white/80">
            {t.finalsNone.replace('{date}', payload.date)}
          </p>
        ) : (
          finals.map((f) => <FinalBand key={f.match.id} final={f} t={t} />)
        )}
      </div>
    </div>
  );
}
