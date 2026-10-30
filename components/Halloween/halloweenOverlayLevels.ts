// components/Halloween/halloweenOverlayLevels.ts
//
// Quelle décoration d'Halloween sur quel overlay OBS — tout le choix est ici,
// une ligne par cas, testé (tests/unit/halloweenOverlayDecor.test.tsx). PUR :
// ce module est importé en statique par les pages d'overlay, les dessins non.
//
// TROIS NIVEAUX :
//   full     toiles et araignées, chauves-souris, sorcière, momie, fantôme,
//            citrouilles — scènes plein écran à fond opaque : le calque passe
//            SOUS leur contenu (z-index 5 contre 10), rien ne couvre un texte ;
//   edges    la même chose moins ce qui traverse l'image — sources transparentes
//            posées sur l'habillage de la régie : on ne voit pas ce qu'il porte
//            (son titre, ses logos), on reste donc dans les marges ;
//   corners  deux toiles discrètes dans les coins du haut, immobiles — posé sur
//            l'image du jeu, rien ne doit y bouger.

import type { OverlaySource } from '@/utils/overlay/matchOverlay';

export type HalloweenOverlayLevel = 'full' | 'edges' | 'corners';

/**
 * Scènes du cockpit caster (`/overlay/caster/<scène>`). Absentes, donc nues :
 * `camera` et `webcam` (une image plein cadre qu'une toile salirait) et `player`.
 */
const CASTER_SCENE_LEVELS: ReadonlyMap<string, HalloweenOverlayLevel> = new Map<
  string,
  HalloweenOverlayLevel
>([
  ['starting', 'full'],
  ['pause', 'full'],
  ['end', 'full'],
  ['results', 'full'],
  ['leaderboard', 'full'],
  ['standings', 'full'],
  ['bracket', 'full'],
  ['mvp', 'full'],
  ['match', 'corners'],
  ['scrim', 'corners'],
]);

export function casterSceneHalloweenLevel(
  type: string
): HalloweenOverlayLevel | null {
  return CASTER_SCENE_LEVELS.get(type) ?? null;
}

/**
 * Au-delà, le bandeau de `/overlay/match` (1 012 px à l'échelle 1, centré)
 * atteint les toiles de 130 px : il vaut mieux perdre la toile que le score.
 */
export const MAX_SCOREBOARD_SCALE = 1.5;

/**
 * Sources de `/overlay/match`. Le tableau de score et l'écran d'attente portent
 * les toiles. Pas les autres : `maps` (600×600, un encart) et `teams` /
 * `countdown` s'empilent sur le tableau de score dans la même scène OBS, et deux
 * jeux de toiles superposés ne seraient plus discrets.
 */
export function matchSourceHalloweenLevel(
  source: OverlaySource,
  scale: number
): HalloweenOverlayLevel | null {
  if (source === 'waiting') return 'corners';
  if (source === 'scoreboard' && scale <= MAX_SCOREBOARD_SCALE) {
    return 'corners';
  }
  return null;
}

/**
 * `/overlay/day` et `/overlay/standings` : des lignes de 1 500 px au plus,
 * centrées, et la décoration dans les 190 px de marge. Agrandies (`?scale=`),
 * les lignes débordent sur ces marges : plus de décoration.
 */
export function listSourceHalloweenLevel(
  scale: number
): HalloweenOverlayLevel | null {
  return scale <= 1 ? 'edges' : null;
}

/**
 * L'URL de la source laisse-t-elle passer la décoration ?
 *   `?halloween=0`  la retire de CETTE source, sans déploiement ;
 *   `?tenant=<slug>` : la source d'un autre organisateur, qui n'a pas à hériter
 *   des citrouilles de la Women's Cup (la marque blanche par domaine passe, elle,
 *   par `useTenantBranding`).
 */
export function urlAllowsHalloween(search: string): boolean {
  const query = new URLSearchParams(search);
  return query.get('halloween') !== '0' && !query.has('tenant');
}

/**
 * Le cadre de la source convient-il ? Les emplacements ci-dessus sont calculés
 * pour une source de 1920 de large : plus étroite, les lignes et les noms
 * atteignent les marges. Pour les toiles, seule la largeur compte (le tableau de
 * score se colle en 1920×250).
 */
export function frameFitsHalloweenLevel(
  level: HalloweenOverlayLevel,
  width: number,
  height: number
): boolean {
  if (level === 'corners') return width >= 1600;
  return width >= 1900 && height >= 1000;
}
