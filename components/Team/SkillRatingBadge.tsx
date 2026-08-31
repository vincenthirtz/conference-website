// components/Team/SkillRatingBadge.tsx
//
// Le niveau Overwatch déclaré, rendu partout de la même façon : « 3k5 · Maître ».
//
// Composant unique plutôt qu'un bout de JSX recopié dans chaque écran (roster
// de gestion, page publique d'équipe) : les couleurs de palier sont une
// convention visuelle, et deux copies divergeraient au premier ajustement —
// exactement ce qui est arrivé aux pastilles de spécialité.
//
// Il ne rend RIEN sur une valeur absente ou hors bornes : « non déclaré » n'est
// pas une information à mettre en avant, et l'appelant qui veut le dire le dit
// lui-même (cf. `t.notDeclared`).

import { useT } from '@/lib/i18n/useT';
import {
  formatSkillRating,
  overwatchTierFromSkillRating,
  type OverwatchTierKey,
} from '@/utils/overwatchRank';
import nsOverwatchRank from '@/lib/i18n/locales/fr/overwatchRank';

type Dict = typeof nsOverwatchRank.fr;

/**
 * Couleurs de palier. Volontairement proches des teintes du jeu, mais tenues à
 * un contraste lisible sur le fond sombre du site — un « or » fidèle passe
 * illisible sur du noir.
 */
const TIER_STYLES: Record<OverwatchTierKey, string> = {
  bronze: 'border-amber-700/50 bg-amber-700/15 text-amber-200',
  silver: 'border-slate-400/50 bg-slate-400/15 text-slate-200',
  gold: 'border-yellow-500/50 bg-yellow-500/15 text-yellow-200',
  platinum: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  emerald: 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200',
  diamond: 'border-sky-400/50 bg-sky-400/15 text-sky-200',
  master: 'border-violet-400/50 bg-violet-400/15 text-violet-200',
  grandmaster: 'border-rose-400/50 bg-rose-400/15 text-rose-200',
};

function tierLabel(t: Dict, tier: OverwatchTierKey): string {
  const labels: Record<OverwatchTierKey, string> = {
    bronze: t.tierBronze,
    silver: t.tierSilver,
    gold: t.tierGold,
    platinum: t.tierPlatinum,
    emerald: t.tierEmerald,
    diamond: t.tierDiamond,
    master: t.tierMaster,
    grandmaster: t.tierGrandmaster,
  };
  return labels[tier];
}

export default function SkillRatingBadge({
  skillRating,
  size = 'sm',
  className = '',
}: {
  skillRating: number | null | undefined;
  /** `md` pour la moyenne d'équipe, mise en avant ; `sm` pour une ligne de roster. */
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useT(nsOverwatchRank);
  const tier = overwatchTierFromSkillRating(skillRating);
  if (tier == null || skillRating == null) return null;

  const sizeClass =
    size === 'md'
      ? 'text-sm px-2.5 py-1 gap-1.5'
      : 'text-[10px] px-1.5 py-0.5 gap-1';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${TIER_STYLES[tier]} ${sizeClass} ${className}`}
    >
      <span className="font-mono">{formatSkillRating(skillRating)}</span>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <span>{tierLabel(t, tier)}</span>
    </span>
  );
}
