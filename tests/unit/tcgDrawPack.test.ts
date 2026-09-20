// Composition d'un paquet TCG.
// Target: utils/tcg/drawPack.ts
//
// Module pur : l'aléa entre par un tableau de tirages, donc chaque cas est
// reproductible. Ce qui compte ici, ce sont les situations DÉGRADÉES — vivier
// trop court, tirage aberrant, viviers vides —, parce qu'un paquet amputé ou
// une carte en double se voient immédiatement à l'ouverture et ne se
// rattrapent pas.

import { describe, expect, it } from 'vitest';

import {
  PACK_SIZE,
  TEAM_SLOTS,
  MAP_SLOTS,
  pickPackSubjects,
} from '../../utils/tcg/drawPack';

const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const TEAMS = ['t1', 't2', 't3'];
/** Slugs quelconques : le tirage ne consulte pas le registre, il reçoit une liste. */
const MAPS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];

/** Tirages neutres : toujours le premier élément restant. */
const ZEROS = Array(12).fill(0);

describe('pickPackSubjects', () => {
  it('compose un paquet complet : quatre joueuses et une équipe', () => {
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      rolls: ZEROS,
    });

    expect(out).toHaveLength(PACK_SIZE);
    expect(out.filter((s) => s.kind === 'team')).toHaveLength(TEAM_SLOTS);
    expect(out.filter((s) => s.kind === 'player')).toHaveLength(
      PACK_SIZE - TEAM_SLOTS
    );
  });

  it('ne répète jamais un sujet dans le même paquet', () => {
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      rolls: [0.9, 0.1, 0.5, 0.99, 0.3, 0.7, 0.2],
    });

    const ids = out.map((s) =>
      s.kind === 'player'
        ? s.userId
        : s.kind === 'map'
          ? s.slug
          : s.kind === 'fanart'
            ? s.fanartId
            : s.kind === 'mascot'
              ? s.slug
              : s.teamId
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('comble avec des joueuses quand aucune équipe n’existe', () => {
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: [],
      rolls: ZEROS,
    });

    expect(out).toHaveLength(PACK_SIZE);
    expect(out.every((s) => s.kind === 'player')).toBe(true);
  });

  it('comble avec des équipes quand les joueuses manquent', () => {
    // Vivier de joueuses plus court que le paquet : on ne sort pas un paquet
    // amputé tant qu'il reste des sujets ailleurs.
    const out = pickPackSubjects({
      playerIds: ['p1', 'p2'],
      teamIds: TEAMS,
      rolls: ZEROS,
    });

    expect(out).toHaveLength(PACK_SIZE);
    expect(out.filter((s) => s.kind === 'player')).toHaveLength(2);
    expect(out.filter((s) => s.kind === 'team')).toHaveLength(3);

    const teamIds = out
      .filter((s): s is { kind: 'team'; teamId: string } => s.kind === 'team')
      .map((s) => s.teamId);
    expect(new Set(teamIds).size).toBe(teamIds.length);
  });

  it('rend moins de cartes seulement quand les deux viviers sont épuisés', () => {
    const out = pickPackSubjects({
      playerIds: ['p1'],
      teamIds: ['t1'],
      rolls: ZEROS,
    });
    expect(out).toHaveLength(2);
  });

  it('rend un paquet vide quand il n’y a aucun sujet', () => {
    // À l'appelant de refuser l'ouverture : un paquet sans carte n'en est pas
    // un, et il ne faut surtout pas consommer le paquet pour autant.
    expect(
      pickPackSubjects({ playerIds: [], teamIds: [], rolls: ZEROS })
    ).toEqual([]);
  });

  it('tolère des tirages manquants ou aberrants', () => {
    // Mieux vaut une carte prévisible qu'un paquet incomplet ou un index hors
    // bornes.
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      rolls: [Number.NaN, -1, 2, Number.POSITIVE_INFINITY],
    });

    expect(out).toHaveLength(PACK_SIZE);
    const ids = out.map((s) =>
      s.kind === 'player'
        ? s.userId
        : s.kind === 'map'
          ? s.slug
          : s.kind === 'fanart'
            ? s.fanartId
            : s.kind === 'mascot'
              ? s.slug
              : s.teamId
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('respecte le tirage fourni : une valeur haute prend la fin du vivier', () => {
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      rolls: [0.99, 0.99, 0, 0, 0, 0],
    });

    // Premier tirage = équipe, valeur haute → dernière équipe du vivier.
    const team = out.find((s) => s.kind === 'team');
    expect(team).toEqual({ kind: 'team', teamId: 't3' });
  });

  /* ------------------------------------------------------------------------
   * L'emplacement de MAP
   *
   * Les cas ci-dessus n'passent aucun `mapSlugs` : ils décrivent le tirage
   * SANS vivier de maps, ce qui reste un cas valide (registre vidé) et une
   * spécification qu'on ne réécrit pas pour un ajout. Ceux qui suivent
   * décrivent la composition que la route produit réellement.
   * --------------------------------------------------------------------- */

  // Trois viviers, chacun avec son repli : un tableau court ne ferait pas
  // échouer le tirage, il le rendrait déterministe sans qu'on le voie.
  const MANY_ZEROS = Array(PACK_SIZE * 4).fill(0);

  it('réserve un emplacement à une map : trois joueuses, une équipe, une map', () => {
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      mapSlugs: MAPS,
      rolls: MANY_ZEROS,
    });

    expect(out).toHaveLength(PACK_SIZE);
    expect(out.filter((s) => s.kind === 'map')).toHaveLength(MAP_SLOTS);
    expect(out.filter((s) => s.kind === 'team')).toHaveLength(TEAM_SLOTS);
    expect(out.filter((s) => s.kind === 'player')).toHaveLength(
      PACK_SIZE - TEAM_SLOTS - MAP_SLOTS
    );
  });

  it('n’évince JAMAIS une joueuse au profit d’une map', () => {
    // La règle de fond : un TCG de compétition parle d'abord de celles qui
    // jouent. Les maps occupent une place que personne ne réclame, elles ne
    // prennent pas celle d'une joueuse. Sans vivier de maps, la composition
    // doit être exactement celle d'avant.
    const withMaps = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      mapSlugs: MAPS,
      rolls: MANY_ZEROS,
    });
    const without = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      rolls: MANY_ZEROS,
    });

    expect(without.filter((s) => s.kind === 'player')).toHaveLength(
      PACK_SIZE - TEAM_SLOTS
    );
    // L'emplacement de map coûte UNE place de joueuse, pas davantage.
    expect(withMaps.filter((s) => s.kind === 'player')).toHaveLength(
      PACK_SIZE - TEAM_SLOTS - MAP_SLOTS
    );
  });

  it('comble avec des maps en dernier recours, sans jamais les répéter', () => {
    // Aucune joueuse, aucune équipe : le paquet reste COMPLET plutôt que
    // d'être amputé — c'est ce qui rend `empty_pool` inatteignable côté route
    // depuis que le registre des maps sert de vivier.
    const out = pickPackSubjects({
      playerIds: [],
      teamIds: [],
      mapSlugs: MAPS,
      rolls: MANY_ZEROS,
    });

    expect(out).toHaveLength(PACK_SIZE);
    expect(out.every((s) => s.kind === 'map')).toBe(true);

    const slugs = out
      .filter((s): s is { kind: 'map'; slug: string } => s.kind === 'map')
      .map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('rend un paquet vide quand les TROIS viviers sont vides', () => {
    // Le registre des maps n'est jamais vide en pratique, mais la fonction ne
    // le suppose pas : c'est ce qui la garde honnête si on le vidait.
    expect(
      pickPackSubjects({
        playerIds: [],
        teamIds: [],
        mapSlugs: [],
        rolls: MANY_ZEROS,
      })
    ).toEqual([]);
  });
});

// -- Les mascottes partagent l'emplacement de DÉCOR ---------------------------
//
// Le risque n'est pas qu'elles n'apparaissent jamais : c'est qu'elles prennent
// la place d'une joueuse. La composition d'un paquet — trois joueuses, une
// équipe, un décor — ne doit pas bouger parce qu'un troisième type de décor
// existe.

describe('cartes mascotte', () => {
  const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const TEAMS = ['t1', 't2'];
  const MAPS = ['m1', 'm2'];
  const MASCOTS = ['pachimari', 'ganymede'];

  it('occupe le décor sans jamais évincer une joueuse', () => {
    // SANS FAN ART, la part de la mascotte reste la sienne (0 → 0,25) et la
    // map prend tout le reste : la part du vivier absent ne lui revient pas.
    const subjects = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      mapSlugs: MAPS,
      mascotSlugs: MASCOTS,
      decorRoll: 0.1,
      rolls: [0, 0, 0, 0, 0, 0],
    });

    const kinds = subjects.map((s) => s.kind);
    expect(subjects).toHaveLength(5);
    expect(kinds.filter((k) => k === 'mascot')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'map')).toHaveLength(0);
    // Une équipe et trois joueuses : exactement la composition d'avant.
    expect(kinds.filter((k) => k === 'team')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'player')).toHaveLength(3);
  });

  it('laisse la map au décor quand le tirage ne désigne pas la mascotte', () => {
    const subjects = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      mapSlugs: MAPS,
      mascotSlugs: MASCOTS,
      decorRoll: 0.9,
      rolls: [0, 0, 0, 0, 0, 0],
    });
    const kinds = subjects.map((s) => s.kind);
    expect(kinds.filter((k) => k === 'map')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'mascot')).toHaveLength(0);
  });

  it('ne change RIEN quand aucune mascotte n’est fournie', () => {
    const args = {
      playerIds: PLAYERS,
      teamIds: TEAMS,
      mapSlugs: MAPS,
      decorRoll: 0.9,
      rolls: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    };
    // Le tirage d'un paquet sans mascotte doit être identique, au sujet près,
    // à ce qu'il était avant leur arrivée : `mascotSlugs` absent ou vide.
    expect(pickPackSubjects({ ...args, mascotSlugs: [] })).toEqual(
      pickPackSubjects(args)
    );
  });
});
