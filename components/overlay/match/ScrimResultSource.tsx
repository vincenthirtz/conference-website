// components/overlay/match/ScrimResultSource.tsx
//
// La source « résultat de scrim » : les deux équipes, le score et le
// vainqueur, sur fond transparent — une carte, sans titre de page. Pensée pour
// l'écran de fin de scrim, à la place d'un overlay « résultat final » tenu à
// la main dans un autre outil : ici le score vient du site, validé.
//
// Mêmes partis pris que les autres sources : bandeau sombre, ombres portées,
// pas d'animation continue hormis le point « en direct ». La carte se met à
// l'échelle pour REMPLIR la source (cf. resultFit), quelle que soit sa taille.

import type { CSSProperties } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import type { OverlayScrimResultResponse } from '@/pages/api/overlay/scrim-result';
import type { OverlayTeamView } from '@/utils/overlay/matchOverlay';
import { useViewportSize } from '@/hooks/useStageFit';

type Dict = typeof nsOverlay.fr;

/** Taille « de conception » de la carte, en pixels. */
export const RESULT_CARD = { w: 1400, h: 460 } as const;
const MARGIN = 12;

/** Facteur qui fait remplir la source à la carte, multiplié par `?scale=`. */
export function resultFit(
  viewport: { width: number; height: number },
  scale = 1
): number {
  return (
    Math.min(
      viewport.width / (RESULT_CARD.w + 2 * MARGIN),
      viewport.height / (RESULT_CARD.h + 2 * MARGIN)
    ) * scale
  );
}

const SHADOW = { textShadow: '0 3px 10px rgba(0,0,0,0.85)' } as const;

function Side({
  team,
  fallback,
  accent,
  dim,
  t,
}: {
  team: OverlayTeamView | null;
  fallback: string;
  accent: string;
  /** Perdante d'un résultat final : en retrait, pour que l'œil aille au vainqueur. */
  dim: boolean;
  t: Dict;
}) {
  const name = team?.name?.trim() || fallback;
  return (
    <div
      className={`flex w-[440px] shrink-0 flex-col items-center gap-5 ${
        dim ? 'opacity-55' : ''
      }`}
    >
      {team?.logoUrl ? (
        // biome-ignore lint/performance/noImgElement: source OBS — next/image n'apporte rien et casse sur un logo distant
        <img
          src={team.logoUrl}
          alt=""
          className="h-44 w-44 object-contain drop-shadow-2xl"
        />
      ) : (
        <div
          className="flex h-44 w-44 items-center justify-center rounded-2xl bg-white/10 text-6xl font-black text-white/80"
          aria-hidden="true"
        >
          {team ? name.slice(0, 2).toUpperCase() : '?'}
        </div>
      )}
      <div
        className="line-clamp-2 w-full break-words text-center text-5xl font-black leading-tight"
        style={{ ...SHADOW, color: team?.isWinner ? accent : '#fff' }}
      >
        {name}
      </div>
      {/* Place du badge réservée des deux côtés : sans elle, la perdante
          descend d'un cran et les deux colonnes ne s'alignent plus. */}
      <span
        className={`rounded-full px-5 py-1.5 text-xl font-black uppercase tracking-[0.25em] text-black ${
          team?.isWinner ? '' : 'invisible'
        }`}
        style={{ backgroundColor: accent }}
        aria-hidden={!team?.isWinner}
      >
        {t.scrimResultWinner}
      </span>
    </div>
  );
}

export function ScrimResultSource({
  payload,
  accent,
  scale,
}: {
  payload: OverlayScrimResultResponse | null;
  accent: string;
  scale: number;
}) {
  const t = useT(nsOverlay);
  const viewport = useViewportSize();
  const scrim = payload?.scrim;
  // Aucun scrim à montrer : source vide et transparente, pas de message à
  // l'antenne.
  if (!scrim) return null;

  const final = scrim.phase === 'final';
  const live = scrim.phase === 'live';
  const showScore = scrim.hasScore && (final || live);
  const anyWinner = !!(scrim.team1?.isWinner || scrim.team2?.isWinner);
  const style: CSSProperties = {
    width: RESULT_CARD.w,
    height: RESULT_CARD.h,
    transform: `translate(-50%, -50%) scale(${resultFit(viewport, scale)})`,
  };

  return (
    <div
      className="absolute left-1/2 top-1/2 flex origin-center flex-col items-center justify-center gap-4 rounded-[2.5rem] bg-black/70 px-12"
      style={style}
      data-phase={scrim.phase}
    >
      <div className="flex items-center gap-4" style={SHADOW}>
        {live ? (
          <span className="inline-flex items-center gap-3 rounded-full bg-red-600 px-6 py-2 text-2xl font-bold uppercase tracking-wider text-white">
            <span className="block h-3.5 w-3.5 shrink-0 animate-pulse rounded-full bg-white" />
            {t.matchPhaseLive}
          </span>
        ) : (
          <span
            className="text-3xl font-black uppercase tracking-[0.35em]"
            style={{ color: accent }}
          >
            {final ? t.scrimResultFinal : t.scrimResultPending}
          </span>
        )}
      </div>

      <div className="flex w-full items-center justify-between">
        <Side
          team={scrim.team1}
          fallback={t.dayTeamTbd}
          accent={accent}
          dim={final && anyWinner && !scrim.team1?.isWinner}
          t={t}
        />
        {/* Chiffres seulement quand un score est posé : résultat final, ou
            score en cours mis à jour par le staff. Jamais de « 0 : 0 »
            inventé à l'antenne. */}
        <div className="flex flex-col items-center" style={SHADOW}>
          <div className="flex items-center gap-6 text-[9rem] font-black leading-none tabular-nums text-white">
            <span>{showScore ? (scrim.team1?.score ?? 0) : '–'}</span>
            <span className="text-white/35">:</span>
            <span>{showScore ? (scrim.team2?.score ?? 0) : '–'}</span>
          </div>
          {scrim.draw && (
            <span className="mt-3 text-3xl font-bold uppercase tracking-widest text-white/70">
              {t.scrimResultDraw}
            </span>
          )}
        </div>
        <Side
          team={scrim.team2}
          fallback={t.dayTeamTbd}
          accent={accent}
          dim={final && anyWinner && !scrim.team2?.isWinner}
          t={t}
        />
      </div>
    </div>
  );
}
