// components/tcg/TcgCardStatsLine.tsx
//
// Niveau, attaque, défense — la ligne « à la Yu-Gi-Oh » de `TcgCard` (lot 11
// de docs/PLAN-tcg-2.md). Les chiffres viennent de `utils/tcg/cardStats.ts` :
// rendus par l'API pour un exemplaire, calculés par la page pour une carte
// qui n'en est pas un (fiche, catalogue). Ce composant ne calcule rien.
//
// DU TEXTE, PAS SEULEMENT DES GLYPHES. Les étoiles redoublent le niveau écrit
// (« Niv. 4 ») et sont décoratives ; « ATK » et « DEF » sont l'abréviation du
// genre, mais un lecteur d'écran épellerait « A T K » : la ligne visible est
// donc cachée de l'arbre d'accessibilité et doublée d'une phrase entière
// (« Niveau 4, attaque 1800, défense 1200 »).
//
// RIEN NE SE ROGNE. Une vignette d'échange fait une centaine de pixels de
// large : les deux valeurs passent à la ligne plutôt que d'être tronquées, et
// huit étoiles tiennent dans une rangée de 180 px.
//
// COULEURS PAR VARIABLES, pas par la palette Tailwind (cliquet
// `ui.tailwindColor`) : attaque rosée, défense bleutée, étoiles au jaune du
// site.

import type { JSX } from 'react';
import type { CardStatProfile, CardStats } from '@/utils/tcg/cardStats';

/**
 * Les libellés de la ligne de chiffres. Gabarits à `{level}`, `{attack}`,
 * `{defense}`, `{profile}`.
 */
export type TcgCardStatsLabels = {
  /** « Niv. {level} » — à côté des étoiles. */
  level: string;
  /** « ATK » — l'abréviation du genre, visible seulement. */
  attack: string;
  /** « DEF ». */
  defense: string;
  /** La phrase entière, pour le lecteur d'écran. */
  aria: string;
  /** « Profil : {profile} » — vue agrandie seulement. */
  profile?: string;
  profiles?: Record<CardStatProfile, string>;
};

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in values ? String(values[k]) : m
  );

export default function TcgCardStatsLine({
  stats,
  labels,
  showProfile = false,
}: {
  stats: CardStats;
  labels: TcgCardStatsLabels;
  showProfile?: boolean;
}): JSX.Element {
  const profileName = labels.profiles?.[stats.profile];
  return (
    <div className="flex flex-col gap-0.5" data-testid="tcg-card-stats">
      <p
        aria-hidden
        className="flex flex-wrap items-center gap-x-1.5 text-[10px] font-semibold text-[var(--color-yellow)]"
      >
        <span className="leading-none tracking-[-0.08em]">
          {'★'.repeat(Math.max(0, Math.min(12, stats.level)))}
        </span>
        <span className="text-[var(--t2,#c7bfca)]">
          {fill(labels.level, { level: stats.level })}
        </span>
      </p>
      <p
        aria-hidden
        className="flex flex-wrap gap-x-2 text-[11px] font-bold tabular-nums text-[var(--t1,#f4edf7)]"
      >
        <span>
          <span className="text-[var(--tcg-atk,#fda4af)]">{labels.attack}</span>{' '}
          {stats.attack}
        </span>
        <span>
          <span className="text-[var(--tcg-def,#7dd3fc)]">
            {labels.defense}
          </span>{' '}
          {stats.defense}
        </span>
      </p>
      <span className="sr-only">
        {fill(labels.aria, {
          level: stats.level,
          attack: stats.attack,
          defense: stats.defense,
        })}
      </span>
      {showProfile && profileName && labels.profile && (
        <p className="text-[11px] text-[var(--t2,#c7bfca)]">
          {fill(labels.profile, { profile: profileName })}
        </p>
      )}
    </div>
  );
}
