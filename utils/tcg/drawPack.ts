// utils/tcg/drawPack.ts
//
// Composition d'un paquet : QUI figure sur les cartes. Module PUR — l'aléa
// entre par un tableau de tirages, comme `isFoil(roll)`, ce qui rend la
// sélection reproductible et testable sans piloter `Math.random`.
//
// LA RARETÉ N'EST PAS CALCULÉE ICI. On tire d'abord les sujets, on calcule
// leur rareté ensuite — cinq calculs au lieu d'un par candidate. L'ordre
// inverse (évaluer tout le vivier pour en choisir cinq) aurait coûté une
// requête de palmarès par joueuse à chaque ouverture, ou obligé à inventer un
// barème réduit « spécial tirage » : une seconde échelle de prestige, que le
// projet refuse depuis `utils/tcg/rarity.ts`.
//
// UNE CARTE D'ÉQUIPE PAR PAQUET, PAS UNE PROBABILITÉ PAR EMPLACEMENT. Tirer
// chaque emplacement indépendamment laisserait sortir des paquets entièrement
// composés d'équipes — rare, mais absurde le jour où ça arrive. Un emplacement
// réservé donne une composition lisible : « quatre joueuses et une équipe ».

/** Cartes par paquet. */
export const PACK_SIZE = 5;

/** Emplacements réservés aux équipes, quand le vivier en contient. */
export const TEAM_SLOTS = 1;

export type DrawnSubject =
  | { kind: 'player'; userId: string }
  | { kind: 'team'; teamId: string };

/**
 * Choisit `count` éléments distincts, ou moins si le vivier est trop petit.
 *
 * `rolls` fournit l'aléa : chaque valeur dans [0, 1) désigne une position dans
 * le vivier restant. Un tirage manquant ou aberrant fait prendre le premier
 * élément disponible — mieux vaut une carte prévisible qu'un paquet incomplet.
 */
function pickDistinct<T>(
  pool: readonly T[],
  count: number,
  rolls: readonly number[]
): T[] {
  const remaining = [...pool];
  const picked: T[] = [];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const roll = rolls[i];
    const safe = Number.isFinite(roll) && roll >= 0 && roll < 1 ? roll : 0;
    const index = Math.min(
      remaining.length - 1,
      Math.floor(safe * remaining.length)
    );
    picked.push(remaining[index]);
    remaining.splice(index, 1);
  }

  return picked;
}

/**
 * Les sujets d'un paquet, dans l'ordre d'affichage.
 *
 * Quand un vivier manque, l'autre comble : un paquet fait toujours `PACK_SIZE`
 * cartes tant qu'il reste des sujets, plutôt que de sortir amputé. Si les deux
 * viviers sont vides, on rend un tableau vide et c'est à l'appelant de refuser
 * l'ouverture — un paquet sans carte n'est pas un paquet.
 */
export function pickPackSubjects(input: {
  playerIds: readonly string[];
  teamIds: readonly string[];
  /** Au moins `PACK_SIZE` valeurs dans [0, 1). */
  rolls: readonly number[];
}): DrawnSubject[] {
  const { playerIds, teamIds, rolls } = input;

  const teamCount = Math.min(TEAM_SLOTS, teamIds.length);
  const teams = pickDistinct(teamIds, teamCount, rolls);

  // Les joueuses occupent le reste, et comblent les emplacements d'équipe
  // laissés vacants par un vivier d'équipes trop court.
  const playerCount = PACK_SIZE - teams.length;
  const players = pickDistinct(playerIds, playerCount, rolls.slice(teamCount));

  // Si les joueuses n'ont pas suffi, on complète avec d'autres équipes.
  const shortfall = PACK_SIZE - teams.length - players.length;
  const extraTeams =
    shortfall > 0
      ? pickDistinct(
          teamIds.filter((id) => !teams.includes(id)),
          shortfall,
          rolls.slice(teamCount + players.length)
        )
      : [];

  return [
    ...players.map((userId): DrawnSubject => ({ kind: 'player', userId })),
    ...teams.map((teamId): DrawnSubject => ({ kind: 'team', teamId })),
    ...extraTeams.map((teamId): DrawnSubject => ({ kind: 'team', teamId })),
  ];
}
