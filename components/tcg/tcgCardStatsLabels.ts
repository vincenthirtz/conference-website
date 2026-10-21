// components/tcg/tcgCardStatsLabels.ts — les libellés de la ligne « Niv. ·
// ATK · DEF » de `TcgCard` (lot 11 de docs/PLAN-tcg-2.md), tirés du namespace
// `playerTcg`.
//
// UNE FONCTION, PAS SEULEMENT LE HOOK `useTcgCardLabels` : les pages publiques
// (fiche joueuse, fiche d'équipe, « TCG en action », accueil) posent leurs
// libellés de carte à la main, et chacune doit dire les chiffres avec les
// MÊMES mots. Aucun import à l'exécution : le namespace n'est lu que par son
// type, la page fournit le dictionnaire déjà traduit.

import type nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import type { TcgCardStatsLabels } from './TcgCardStatsLine';

export function tcgCardStatsLabels(
  t: typeof nsPlayerTcg.fr
): TcgCardStatsLabels {
  return {
    level: t.statsLevel,
    attack: t.statsAttack,
    defense: t.statsDefense,
    aria: t.statsAria,
    profile: t.statsProfile,
    profiles: {
      assault: t.statsProfileAssault,
      bulwark: t.statsProfileBulwark,
      balanced: t.statsProfileBalanced,
    },
  };
}
