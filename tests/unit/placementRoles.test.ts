import { describe, it, expect } from 'vitest';
import {
  describePlacementRule,
  parsePlacementRules,
  resolvePlacementRoles,
  ruleCoversRank,
  type PlacementRule,
} from '../../utils/discord/placementRoles';

const R1 = '111111111111111111';
const R2 = '222222222222222222';
const R3 = '333333333333333333';

const rules: PlacementRule[] = [
  { from: 1, to: 1, roleId: R1, label: 'Vainqueure' },
  { from: 1, to: 3, roleId: R2, label: 'Podium' },
  { from: 1, to: null, roleId: R3, label: 'Participante' },
];

describe('parsePlacementRules', () => {
  it('accepte une liste valide', () => {
    const parsed = parsePlacementRules([
      { from: 1, to: 1, roleId: R1, label: 'Vainqueure' },
    ]);
    expect(parsed).toEqual([{ from: 1, to: 1, roleId: R1, label: 'Vainqueure' }]);
  });

  it('accepte `to: null` — « et tout le reste »', () => {
    expect(parsePlacementRules([{ from: 4, to: null, roleId: R1 }])).toEqual([
      { from: 4, to: null, roleId: R1, label: null },
    ]);
  });

  it('écarte la règle invalide SANS jeter les autres', () => {
    const parsed = parsePlacementRules([
      { from: 1, to: 1, roleId: 'pas-un-snowflake' },
      { from: 2, to: 2, roleId: R2 },
    ]);
    expect(parsed.map((r) => r.roleId)).toEqual([R2]);
  });

  it('refuse une plage inversée', () => {
    expect(parsePlacementRules([{ from: 5, to: 2, roleId: R1 }])).toEqual([]);
  });

  it('refuse un rang nul, négatif ou non entier', () => {
    expect(parsePlacementRules([{ from: 0, to: 1, roleId: R1 }])).toEqual([]);
    expect(parsePlacementRules([{ from: -1, to: 1, roleId: R1 }])).toEqual([]);
    expect(parsePlacementRules([{ from: 1.5, to: 2, roleId: R1 }])).toEqual([]);
  });

  it('rend [] plutôt que null sur une entrée inexploitable', () => {
    expect(parsePlacementRules(null)).toEqual([]);
    expect(parsePlacementRules('nope')).toEqual([]);
    expect(parsePlacementRules([1, 2, 3])).toEqual([]);
  });

  it('plafonne à 12 règles', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      from: i + 1,
      to: i + 1,
      roleId: R1,
    }));
    expect(parsePlacementRules(many)).toHaveLength(12);
  });

  it('tronque un libellé trop long', () => {
    const parsed = parsePlacementRules([
      { from: 1, to: 1, roleId: R1, label: 'x'.repeat(200) },
    ]);
    expect(parsed[0].label).toHaveLength(60);
  });
});

describe('ruleCoversRank', () => {
  it('couvre les bornes, inclusives', () => {
    const r: PlacementRule = { from: 2, to: 4, roleId: R1 };
    expect([1, 2, 3, 4, 5].map((n) => ruleCoversRank(r, n))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it('`to: null` s’étend indéfiniment', () => {
    const r: PlacementRule = { from: 4, to: null, roleId: R1 };
    expect(ruleCoversRank(r, 3)).toBe(false);
    expect(ruleCoversRank(r, 400)).toBe(true);
  });
});

describe('resolvePlacementRoles', () => {
  const rankings = [
    { teamId: 'a', teamName: 'Alpha', rank: 1 },
    { teamId: 'b', teamName: 'Bravo', rank: 2 },
    { teamId: 'c', teamName: 'Charlie', rank: 4 },
  ];

  it('cumule les rôles : la gagnante prend les trois', () => {
    const res = resolvePlacementRoles(rankings, rules);
    expect(res[0]).toEqual({
      teamId: 'a',
      teamName: 'Alpha',
      rank: 1,
      roleIds: [R1, R2, R3],
    });
  });

  it('ne donne que ce qui s’applique', () => {
    const res = resolvePlacementRoles(rankings, rules);
    expect(res[1].roleIds).toEqual([R2, R3]); // 2e : podium + participante
    expect(res[2].roleIds).toEqual([R3]); // 4e : participante seule
  });

  it('ne pose jamais deux fois le même rôle', () => {
    const res = resolvePlacementRoles(rankings, [
      { from: 1, to: 1, roleId: R1 },
      { from: 1, to: 3, roleId: R1 },
    ]);
    expect(res[0].roleIds).toEqual([R1]);
  });

  it('omet les équipes sans aucun rôle applicable', () => {
    const res = resolvePlacementRoles(rankings, [
      { from: 1, to: 1, roleId: R1 },
    ]);
    expect(res.map((r) => r.teamId)).toEqual(['a']);
  });

  it('rend [] quand aucune règle n’est configurée', () => {
    expect(resolvePlacementRoles(rankings, [])).toEqual([]);
  });

  it('ignore une ligne de classement inexploitable', () => {
    const res = resolvePlacementRoles(
      [
        { teamId: '', rank: 1 },
        { teamId: 'b', rank: 0 },
        { teamId: 'c', rank: 1 },
      ],
      [{ from: 1, to: 1, roleId: R1 }]
    );
    expect(res.map((r) => r.teamId)).toEqual(['c']);
  });

  it('suit l’ordre des règles, pas celui des rôles', () => {
    const res = resolvePlacementRoles(rankings, [
      { from: 1, to: null, roleId: R3 },
      { from: 1, to: 1, roleId: R1 },
    ]);
    expect(res[0].roleIds).toEqual([R3, R1]);
  });
});

describe('describePlacementRule', () => {
  it('dit la place unique', () => {
    expect(describePlacementRule({ from: 1, to: 1, roleId: R1 })).toBe(
      '1re place'
    );
    expect(describePlacementRule({ from: 3, to: 3, roleId: R1 })).toBe(
      '3e place'
    );
  });

  it('dit la plage', () => {
    expect(describePlacementRule({ from: 1, to: 8, roleId: R1 })).toBe(
      'De la 1re à la 8e place'
    );
  });

  it('dit « toutes » quand la plage part de 1 et ne finit pas', () => {
    expect(describePlacementRule({ from: 1, to: null, roleId: R1 })).toBe(
      'Toutes les équipes classées'
    );
    expect(describePlacementRule({ from: 9, to: null, roleId: R1 })).toBe(
      'À partir de la 9e place'
    );
  });
});
