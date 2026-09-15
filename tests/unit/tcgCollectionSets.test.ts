// tests/unit/tcgCollectionSets.test.ts
//
// Séries du TCG — le calcul PUR (`utils/tcg/collectionSets.ts`).
//
// CE QUE CES CAS PROTÈGENT.
//   1. UNE SÉRIE N'EST JAMAIS INCOMPLÉTABLE : toutes ses cartes appartiennent
//      au vivier du tirage. Une équipe inactive ou une joueuse hors du vivier
//      en sort, au lieu de bloquer la série à 5/6.
//   2. ON NE NOMME JAMAIS UNE JOUEUSE MANQUANTE : ni dans `missingNamed`, ni
//      dans les noms publics de la définition, ni dans le libellé qui part en
//      DM.
//   3. LE CONSENTEMENT PHOTO NE TOUCHE PAS LES SÉRIES : il n'est même pas une
//      entrée du calcul. Une joueuse sans photo a une carte, donc une place.
//   4. LA CLÉ EST STABLE : faite d'identifiants, pas de noms.

import { describe, expect, it } from 'vitest';
import {
  buildCollectionSets,
  collectionSetLabelFr,
  evaluateCollectionSets,
  MIN_SET_SIZE,
  type CollectionSetSources,
} from '../../utils/tcg/collectionSets';

const T1 = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const TEAM_A = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const TEAM_B = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const TEAM_C = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f';
const TEAM_GONE = '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80';
const P1 = '5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091';
const P2 = '6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f8091a2';
const P3 = '7a8b9c0d-1e2f-4a3b-8c5d-6e7f8091a2b3';
const P_OUT = '8b9c0d1e-2f3a-4b4c-9d6e-7f8091a2b3c4';

function sources(
  over: Partial<CollectionSetSources> = {}
): CollectionSetSources {
  return {
    maps: [
      { slug: 'busan', name: 'Busan', layout: 'control' },
      { slug: 'ilios', name: 'Ilios', layout: 'control' },
      { slug: 'nepal', name: 'Népal', layout: 'control' },
      { slug: 'dorado', name: 'Dorado', layout: 'escort' },
      { slug: 'havana', name: 'La Havane', layout: 'escort' },
    ],
    drawablePlayerIds: new Set([P1, P2, P3]),
    drawableTeamIds: new Set([TEAM_A, TEAM_B, TEAM_C]),
    tournaments: [
      {
        id: T1,
        name: 'Cup 2026',
        teams: [
          { id: TEAM_A, name: 'Aurores', rosterUserIds: [P1, P2, P_OUT] },
          { id: TEAM_B, name: 'Brumes', rosterUserIds: [P3] },
          { id: TEAM_C, name: 'Comètes', rosterUserIds: [] },
          { id: TEAM_GONE, name: 'Dissoute', rosterUserIds: [P1, P2] },
        ],
      },
    ],
    ...over,
  };
}

describe('buildCollectionSets', () => {
  it('définit une série par mode de maps assez fourni, et rien en dessous du minimum', () => {
    const sets = buildCollectionSets(sources());
    const maps = sets.filter((s) => s.kind === 'map_mode');
    // Contrôle : 3 maps → série ; Escorte : 2 maps → sous MIN_SET_SIZE.
    expect(MIN_SET_SIZE).toBe(3);
    expect(maps.map((s) => s.key)).toEqual(['maps:control']);
    expect(maps[0].cards).toEqual(['map:busan', 'map:ilios', 'map:nepal']);
    expect(maps[0].publicNames['map:nepal']).toBe('Népal');
  });

  it('ne met dans une série QUE des cartes tirables', () => {
    const sets = buildCollectionSets(sources());

    const teams = sets.find((s) => s.key === `tournament:${T1}`);
    // L'équipe hors du vivier (dissoute) sort de la série des équipes.
    expect(teams?.cards).toEqual([
      `team:${TEAM_A}`,
      `team:${TEAM_B}`,
      `team:${TEAM_C}`,
    ]);

    const rosterA = sets.find((s) => s.key === `roster:${T1}:${TEAM_A}`);
    // La joueuse hors du vivier sort du roster : sinon 3/4 à vie.
    expect(rosterA?.cards).toEqual(
      [`player:${P1}`, `player:${P2}`, `team:${TEAM_A}`].sort()
    );

    // Pas de série de roster pour une équipe hors vivier, ni pour un roster
    // trop court (équipe + 1 joueuse = 2 cartes).
    expect(sets.some((s) => s.key === `roster:${T1}:${TEAM_GONE}`)).toBe(false);
    expect(sets.some((s) => s.key === `roster:${T1}:${TEAM_B}`)).toBe(false);
    expect(sets.some((s) => s.key === `roster:${T1}:${TEAM_C}`)).toBe(false);
  });

  it('ne porte aucun nom de joueuse dans ses noms publics', () => {
    const sets = buildCollectionSets(sources());
    for (const set of sets) {
      for (const key of Object.keys(set.publicNames)) {
        expect(key.startsWith('player:')).toBe(false);
      }
    }
  });

  it('forge des clés faites d’identifiants, indépendantes des noms', () => {
    const renamed = sources();
    const before = buildCollectionSets(renamed).map((s) => s.key);
    const after = buildCollectionSets({
      ...renamed,
      tournaments: renamed.tournaments.map((t) => ({
        ...t,
        name: 'Nouveau nom',
        teams: t.teams.map((team) => ({ ...team, name: `${team.name} bis` })),
      })),
    }).map((s) => s.key);
    expect(after).toEqual(before);
  });

  it('dédoublonne une joueuse présente deux fois dans un effectif', () => {
    const sets = buildCollectionSets(
      sources({
        tournaments: [
          {
            id: T1,
            name: 'Cup',
            teams: [
              {
                id: TEAM_A,
                name: 'Aurores',
                rosterUserIds: [P1, P1, P2],
              },
            ],
          },
        ],
      })
    );
    const roster = sets.find((s) => s.kind === 'team_roster');
    expect(roster?.cards).toHaveLength(3);
  });
});

describe('evaluateCollectionSets', () => {
  const sets = buildCollectionSets(sources());
  const rosterKey = `roster:${T1}:${TEAM_A}`;

  it('compte ce qui est possédé et dit la complétion', () => {
    const progress = evaluateCollectionSets(
      sets,
      new Set([`team:${TEAM_A}`, `player:${P1}`, `player:${P2}`])
    );
    const roster = progress.find((p) => p.key === rosterKey);
    expect(roster).toMatchObject({ owned: 3, total: 3, complete: true });
    expect(roster?.missingNamed).toEqual([]);
    expect(roster?.missingPlayers).toBe(0);
  });

  it('nomme les équipes et maps manquantes, jamais les joueuses', () => {
    const progress = evaluateCollectionSets(sets, new Set([`player:${P1}`]));

    const roster = progress.find((p) => p.key === rosterKey);
    expect(roster?.complete).toBe(false);
    expect(roster?.missingPlayers).toBe(1);
    expect(roster?.missingNamed).toEqual([
      { kind: 'team', id: TEAM_A, name: 'Aurores' },
    ]);
    // Aucune trace de la joueuse manquante, ni par identifiant ni par nom.
    expect(JSON.stringify(roster)).not.toContain(P2);

    const maps = progress.find((p) => p.key === 'maps:control');
    expect(maps?.missingNamed.map((m) => m.name)).toEqual([
      'Busan',
      'Ilios',
      'Népal',
    ]);
  });

  it('se lit sur l’état présent : une carte qui part fait redescendre le compteur', () => {
    const all = new Set([`team:${TEAM_A}`, `player:${P1}`, `player:${P2}`]);
    const complete = evaluateCollectionSets(sets, all).find(
      (p) => p.key === rosterKey
    );
    all.delete(`player:${P2}`);
    const after = evaluateCollectionSets(sets, all).find(
      (p) => p.key === rosterKey
    );
    expect(complete?.complete).toBe(true);
    expect(after).toMatchObject({ owned: 2, complete: false });
  });

  it('ignore le consentement photo : ce n’est pas une entrée du calcul', () => {
    // Rien dans `CollectionSetSources` ne parle de photo : une joueuse sans
    // photo consentie reste dans la série, sa carte existant avec un avatar.
    const keys = Object.keys(sources()).sort();
    expect(keys).toEqual(
      ['drawablePlayerIds', 'drawableTeamIds', 'maps', 'tournaments'].sort()
    );
  });
});

describe('collectionSetLabelFr', () => {
  it('nomme le mode, l’édition ou l’équipe — jamais une joueuse', () => {
    const sets = buildCollectionSets(sources());
    const labels = sets.map(collectionSetLabelFr);
    expect(labels).toContain('Maps — Contrôle');
    expect(labels).toContain('Équipes — Cup 2026');
    expect(labels).toContain('Roster Aurores — Cup 2026');
    for (const label of labels) {
      expect(label).not.toMatch(new RegExp(`${P1}|${P2}|${P3}`));
    }
  });

  it('se passe d’un nom manquant sans produire « null »', () => {
    expect(
      collectionSetLabelFr({
        kind: 'team_roster',
        mode: null,
        tournamentName: null,
        teamName: null,
      })
    ).toBe('Roster équipe — édition');
  });
});
