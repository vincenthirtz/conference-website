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
// UNE CARTE D'ÉQUIPE ET UNE CARTE DE MAP PAR PAQUET, PAS UNE PROBABILITÉ PAR
// EMPLACEMENT. Tirer chaque emplacement indépendamment laisserait sortir des
// paquets entièrement composés d'équipes — rare, mais absurde le jour où ça
// arrive. Des emplacements réservés donnent une composition lisible : « trois
// joueuses, une équipe, une map ».

import { pickDecorKind } from './fanart';

/** Cartes par paquet. */
export const PACK_SIZE = 5;

/** Emplacements réservés aux équipes, quand le vivier en contient. */
export const TEAM_SLOTS = 1;

/**
 * Emplacements réservés aux maps, quand le registre en contient.
 *
 * Le vivier des maps est un REGISTRE EN MÉMOIRE (`config/maps/overwatch.ts`),
 * pas une table : il n'est jamais vide en pratique, et n'a pas besoin d'être
 * plafonné par `POOL_LIMIT`. Il reste traité comme les autres ici — un vivier
 * qu'on pourrait vider sans casser le tirage.
 */
export const MAP_SLOTS = 1;

/**
 * L'emplacement de DÉCOR, partagé entre les maps et les fan arts validées.
 * Même valeur que `MAP_SLOTS` : les fan arts n'ajoutent pas de carte au paquet,
 * elles prennent la place du décor une fois sur deux
 * (`FANART_DECOR_SHARE`).
 */
export const DECOR_SLOTS = MAP_SLOTS;

/**
 * Sujets lus au plus dans chaque vivier lors d'un tirage.
 *
 * EXPORTÉ PARCE QUE LE DÉNOMINATEUR EN DÉPEND. La progression de collection
 * affiche « X sur Y » : si Y comptait TOUS les sujets alors que le tirage n'en
 * regarde que les mille premiers, on promettrait des cartes qu'aucun paquet ne
 * peut donner — une joueuse resterait bloquée à 999/1200 sans comprendre. Le
 * décompte du vivier doit donc se plafonner ici aussi, et la seule façon d'en
 * être sûr est que les deux lisent la MÊME constante.
 */
export const POOL_LIMIT = 1000;

export type DrawnSubject =
  | { kind: 'player'; userId: string }
  | { kind: 'team'; teamId: string }
  | { kind: 'map'; slug: string }
  | { kind: 'fanart'; fanartId: string };

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
 * Quand un vivier manque, les autres comblent : un paquet fait toujours
 * `PACK_SIZE` cartes tant qu'il reste des sujets, plutôt que de sortir amputé.
 * Si TOUS les viviers sont vides, on rend un tableau vide et c'est à l'appelant
 * de refuser l'ouverture — un paquet sans carte n'est pas un paquet.
 *
 * L'ORDRE DE COMBLEMENT EST DÉLIBÉRÉ : les joueuses d'abord, puis les équipes,
 * puis les maps. Un TCG de compétition parle d'abord de celles qui jouent ; les
 * maps sont un décor du tournoi, pas son sujet. Elles ne doivent donc jamais
 * évincer une joueuse d'un paquet, seulement occuper une place que personne ne
 * réclame.
 */
export function pickPackSubjects(input: {
  playerIds: readonly string[];
  teamIds: readonly string[];
  /** Slugs du registre des maps ; vide = pas de carte de map. */
  mapSlugs?: readonly string[];
  /**
   * Fan arts VALIDÉES de l'espace ; vide = comportement d'avant les fan arts.
   * Elles partagent l'emplacement de DÉCOR avec les maps — jamais celui d'une
   * joueuse (cf. `utils/tcg/fanart.ts`).
   */
  fanartIds?: readonly string[];
  /**
   * Tirage qui décide du décor : map ou fan art. Séparé des `rolls` pour que
   * l'ajout des fan arts ne décale pas l'aléa des autres emplacements — un
   * paquet tiré avec les mêmes `rolls` qu'avant sort identique tant qu'aucune
   * fan art n'est validée.
   */
  decorRoll?: number;
  /** Au moins `PACK_SIZE` valeurs dans [0, 1). */
  rolls: readonly number[];
}): DrawnSubject[] {
  const { playerIds, teamIds, rolls } = input;
  const mapSlugs = input.mapSlugs ?? [];
  const fanartIds = input.fanartIds ?? [];

  const teamCount = Math.min(TEAM_SLOTS, teamIds.length);
  const teams = pickDistinct(teamIds, teamCount, rolls);

  // L'emplacement de DÉCOR : une map, ou une fan art de la communauté. Un seul
  // des deux, jamais les deux — la composition du paquet ne bouge pas.
  const decor = pickDecorKind({
    roll: input.decorRoll ?? Number.NaN,
    hasFanart: fanartIds.length > 0,
    hasMaps: mapSlugs.length > 0,
  });

  const mapCount = decor === 'map' ? Math.min(MAP_SLOTS, mapSlugs.length) : 0;
  const maps = pickDistinct(mapSlugs, mapCount, rolls.slice(teamCount));

  const fanartCount =
    decor === 'fanart' ? Math.min(DECOR_SLOTS, fanartIds.length) : 0;
  const fanarts = pickDistinct(
    fanartIds,
    fanartCount,
    rolls.slice(teamCount + mapCount)
  );

  // Les joueuses occupent le reste, et comblent les emplacements réservés
  // laissés vacants par un vivier d'équipes ou de décor trop court.
  const playerCount = PACK_SIZE - teams.length - maps.length - fanarts.length;
  const players = pickDistinct(
    playerIds,
    playerCount,
    rolls.slice(teamCount + mapCount + fanartCount)
  );

  // Si les joueuses n'ont pas suffi, on complète avec d'autres équipes, puis
  // avec d'autres maps — dans cet ordre, cf. l'en-tête de la fonction.
  let shortfall =
    PACK_SIZE - teams.length - maps.length - fanarts.length - players.length;
  const consumed = teamCount + mapCount + fanartCount + players.length;

  const extraTeams =
    shortfall > 0
      ? pickDistinct(
          teamIds.filter((id) => !teams.includes(id)),
          shortfall,
          rolls.slice(consumed)
        )
      : [];
  shortfall -= extraTeams.length;

  const extraMaps =
    shortfall > 0
      ? pickDistinct(
          mapSlugs.filter((s) => !maps.includes(s)),
          shortfall,
          rolls.slice(consumed + extraTeams.length)
        )
      : [];

  return [
    ...players.map((userId): DrawnSubject => ({ kind: 'player', userId })),
    ...teams.map((teamId): DrawnSubject => ({ kind: 'team', teamId })),
    ...extraTeams.map((teamId): DrawnSubject => ({ kind: 'team', teamId })),
    ...maps.map((slug): DrawnSubject => ({ kind: 'map', slug })),
    ...extraMaps.map((slug): DrawnSubject => ({ kind: 'map', slug })),
    ...fanarts.map((fanartId): DrawnSubject => ({ kind: 'fanart', fanartId })),
  ];
}
