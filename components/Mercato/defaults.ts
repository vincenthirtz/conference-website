// components/Mercato/defaults.ts
//
// Les champs du hub mercato, complétés par leurs valeurs vides quand une
// réponse ne les porte pas.
//
// POURQUOI. Le site et l'API se déploient séparément (deux Workers). Si le site
// part avant l'API qui projette ces champs, une liste reçoit des fiches sans
// `positions`, `platforms`… et un `.map()` sur `undefined` ferait tomber toute
// la page. Compléter à la réception coûte une ligne et garde l'écran debout
// — la fiche s'affiche alors comme une fiche d'avant le mercato.

import type { PublicFreePlayer } from '@/utils/freePlayers';
import type { PublicTeamOpening } from '@/utils/teamOpenings';

const arr = <T>(v: readonly T[] | null | undefined): T[] =>
  Array.isArray(v) ? [...v] : [];

export function withPlayerDefaults(p: PublicFreePlayer): PublicFreePlayer {
  return {
    ...p,
    roles: arr(p.roles),
    gender: p.gender ?? null,
    rankDivision: p.rankDivision ?? null,
    platforms: arr(p.platforms),
    inputs: arr(p.inputs),
    mainRole: p.mainRole ?? null,
    positions: arr(p.positions),
    pastTeams: p.pastTeams ?? null,
    goals: p.goals ?? null,
  };
}

/** Annonce publique OU annonce de l'espace capitaine (mêmes champs). */
export function withOpeningDefaults<
  T extends Pick<
    PublicTeamOpening,
    | 'roles'
    | 'soughtGenders'
    | 'rankMin'
    | 'rankMax'
    | 'platforms'
    | 'inputs'
    | 'positions'
  >,
>(o: T): T {
  return {
    ...o,
    roles: arr(o.roles),
    soughtGenders: arr(o.soughtGenders),
    rankMin: o.rankMin ?? null,
    rankMax: o.rankMax ?? null,
    platforms: arr(o.platforms),
    inputs: arr(o.inputs),
    positions: arr(o.positions),
  };
}
