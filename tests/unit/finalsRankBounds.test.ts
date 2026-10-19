// tests/unit/finalsRankBounds.test.ts
//
// Couvre utils/tournament/finalsRankBounds.ts et son effet sur la course aux
// finales (buildFinalsPhase).
//
// Le jeu de données est la saison régulière de la Cup 2026 au 19/10 (26 matchs
// joués, 2 à jouer, bo3) : Venom Valkyries et LVN ASHES ne peuvent plus finir
// qu'à égalité à 9 points, et Venom a gagné leur confrontation directe —
// premier départage. 4e quoi qu'il arrive : la course aux points seuls la
// laissait « en course ».

import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import FinalsPhaseView from '../../components/tournament/FinalsPhaseView';
import {
  computeRankBounds,
  countScenarios,
  MAX_RANK_SCENARIOS,
  readFinalsRankBounds,
  seriesOutcomes,
  type PageMatchRef,
} from '../../utils/tournament/finalsRankBounds';
import {
  buildFinalsPhase,
  type FinalsMatch,
  type RaceMatch,
  type RankBounds,
} from '../../utils/tournament/finalsPhase';
import type {
  PrefetchedStageInputs,
  StageMatchRow,
} from '../../utils/stages/standings';
import type { PublicStandingRow } from '../../utils/stages/publicStandings';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAGE = { id: 'stage-rs', stage_type: 'round_robin', settings: {} };

// H Hinode Sparkles, C Chocomates, E LVN EMBERS, V Venom Valkyries,
// A LVN ASHES, S Shujaa Angel's, P Team Positivité, X Éclypse (disqualifiée,
// mode forfait).
const TEAMS = ['H', 'C', 'E', 'V', 'A', 'S', 'P', 'X'] as const;

type Played = [id: string, t1: string, s1: number, s2: number, t2: string];

const PLAYED: Played[] = [
  ['m01', 'C', 2, 0, 'E'],
  ['m02', 'X', 2, 0, 'P'],
  ['m03', 'A', 1, 2, 'V'], // la confrontation directe qui départage
  ['m04', 'A', 2, 0, 'P'],
  ['m05', 'H', 2, 0, 'S'],
  ['m06', 'X', 0, 2, 'E'],
  ['m07', 'A', 2, 1, 'S'],
  ['m08', 'P', 0, 2, 'E'],
  ['m09', 'V', 0, 2, 'S'],
  ['m10', 'X', 0, 2, 'H'],
  ['m11', 'V', 0, 2, 'C'],
  ['m12', 'S', 0, 2, 'C'],
  ['m13', 'P', 0, 2, 'H'],
  ['m14', 'V', 2, 0, 'X'],
  ['m15', 'A', 0, 2, 'C'],
  ['m16', 'E', 0, 2, 'H'],
  ['m17', 'P', 0, 2, 'V'],
  ['m18', 'A', 0, 2, 'H'],
  ['m19', 'E', 2, 0, 'V'],
  ['m20', 'A', 0, 2, 'E'],
  ['m21', 'H', 2, 1, 'C'],
  ['m22', 'X', 0, 2, 'C'],
  ['m23', 'X', 0, 2, 'A'],
  ['m24', 'X', 0, 2, 'S'],
  ['m25', 'P', 2, 0, 'S'],
  ['m26', 'E', 2, 0, 'S'],
];

const PENDING: [id: string, t1: string, t2: string][] = [
  ['m27', 'C', 'P'],
  ['m28', 'H', 'V'],
];

function matchRows(): StageMatchRow[] {
  return [
    ...PLAYED.map(([id, t1, s1, s2, t2]) => ({
      id,
      status: 'finished',
      deleted_at: null,
      is_bye: false,
      round_number: 1,
      team1_id: t1,
      team2_id: t2,
      winner_team_id: s1 > s2 ? t1 : t2,
      team1_score: s1,
      team2_score: s2,
      group_key: null,
    })),
    ...PENDING.map(([id, t1, t2]) => ({
      id,
      status: 'pending',
      deleted_at: null,
      is_bye: false,
      round_number: 7,
      team1_id: t1,
      team2_id: t2,
      winner_team_id: null,
      team1_score: null,
      team2_score: null,
      group_key: null,
    })),
  ];
}

function inputs(
  over: Partial<PrefetchedStageInputs> = {}
): PrefetchedStageInputs {
  return {
    stageTeams: {
      data: TEAMS.map((id, i) => ({
        team_id: id,
        seed: i + 1,
        team: { id, name: id, short_name: null },
      })),
      error: null,
    },
    matches: { data: matchRows(), error: null },
    disqualified: new Map([
      [
        'X',
        {
          teamId: 'X',
          mode: 'forfeit' as const,
          disqualifiedAt: '2026-10-08T12:00:00Z',
          reason: null,
          disqualifiedBy: null,
        },
      ],
    ]),
    settings: {},
    overrides: [],
    ...over,
  };
}

const bo3 = () => 'bo3';

function plain(bounds: Map<string, RankBounds> | null) {
  return bounds ? Object.fromEntries(bounds) : null;
}

describe('seriesOutcomes / countScenarios', () => {
  it('bo1, bo3, bo5 : toutes les issues, vainqueur des deux côtés', () => {
    expect(seriesOutcomes('bo1')).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(seriesOutcomes('bo3')).toEqual([
      [2, 0],
      [0, 2],
      [2, 1],
      [1, 2],
    ]);
    expect(seriesOutcomes('BO5')).toHaveLength(6);
  });

  it('format pair, inconnu ou absent : pas de simulation', () => {
    expect(seriesOutcomes('bo2')).toBeNull();
    expect(seriesOutcomes('single_map')).toBeNull();
    expect(seriesOutcomes(null)).toBeNull();
    expect(seriesOutcomes(undefined)).toBeNull();
  });

  it('compte le produit des issues ; null dès qu’un format échappe', () => {
    expect(countScenarios(['bo3', 'bo3'])).toBe(16);
    expect(countScenarios(['bo3', null])).toBeNull();
    expect(countScenarios(Array(7).fill('bo3'))).toBeGreaterThan(
      MAX_RANK_SCENARIOS
    );
    expect(countScenarios(Array(6).fill('bo3'))).toBe(MAX_RANK_SCENARIOS);
  });
});

describe('computeRankBounds — Cup 2026 au 19/10', () => {
  it('les quatre finalistes sont fixées : Venom 4e quoi qu’il arrive', async () => {
    const bounds = await computeRankBounds({
      tenantId: TENANT,
      stage: STAGE,
      inputs: inputs(),
      formatOf: bo3,
    });
    expect(plain(bounds)).toEqual({
      H: { best: 1, worst: 1 },
      C: { best: 2, worst: 2 },
      E: { best: 3, worst: 3 },
      V: { best: 4, worst: 4 },
      A: { best: 5, worst: 5 },
      // Positivité, si elle bat Chocomates, rejoint Shujaa à 6 pts et l'a
      // battue : les deux places restent ouvertes.
      S: { best: 6, worst: 7 },
      P: { best: 6, worst: 7 },
      X: { best: 8, worst: 8 },
    });
  });

  it('respecte l’ordre de départage de la phase (différence de score d’abord)', async () => {
    // Venom battue 0-2 finit à -3, ASHES à -2 : ASHES passerait devant.
    const bounds = await computeRankBounds({
      tenantId: TENANT,
      stage: STAGE,
      inputs: inputs({
        settings: { standings_tiebreakers: ['score_diff', 'head_to_head'] },
      }),
      formatOf: bo3,
    });
    expect(bounds?.get('V')).toEqual({ best: 4, worst: 5 });
    expect(bounds?.get('A')).toEqual({ best: 4, worst: 5 });
  });

  it('respecte un départage manuel du staff', async () => {
    const bounds = await computeRankBounds({
      tenantId: TENANT,
      stage: STAGE,
      inputs: inputs({
        overrides: [{ winner_team_id: 'A', loser_team_id: 'V' }],
      }),
      formatOf: bo3,
    });
    // À égalité (Venom battue), le staff place ASHES devant.
    expect(bounds?.get('V')).toEqual({ best: 4, worst: 5 });
  });

  it('null hors round robin, format non simulable, lecture en échec', async () => {
    const base = { tenantId: TENANT, inputs: inputs(), formatOf: bo3 };
    expect(
      await computeRankBounds({
        ...base,
        stage: { id: STAGE.id, stage_type: 'swiss' },
      })
    ).toBeNull();
    expect(
      await computeRankBounds({ ...base, stage: STAGE, formatOf: () => null })
    ).toBeNull();
    expect(
      await computeRankBounds({
        ...base,
        stage: STAGE,
        inputs: inputs({ matches: { data: null, error: { message: 'x' } } }),
      })
    ).toBeNull();
  });
});

describe('buildFinalsPhase — avec les rangs encore possibles', () => {
  // Le classement public au 19/10 (points, matchs restants).
  function row(
    rank: number,
    id: string,
    wins: number,
    losses: number,
    disqualified = false
  ): PublicStandingRow {
    return {
      rank,
      teamId: id,
      teamName: id,
      shortName: null,
      slug: id.toLowerCase(),
      logoUrl: null,
      played: wins + losses,
      wins,
      losses,
      draws: 0,
      points: wins * 3,
      mapsWon: 0,
      mapsLost: 0,
      form: [],
      tiebrokenBy: null,
      disqualified,
      disqualificationMode: disqualified ? 'forfeit' : null,
    };
  }
  const STANDINGS = [
    row(1, 'H', 6, 0),
    row(2, 'C', 5, 1),
    row(3, 'E', 5, 2),
    row(4, 'V', 3, 3),
    row(5, 'A', 3, 4),
    row(6, 'S', 2, 5),
    row(7, 'P', 1, 5),
    row(8, 'X', 1, 6, true),
  ];
  const final = (id: string, round: number, name: string): FinalsMatch => ({
    id,
    round_number: round,
    round_name: name,
    scheduled_at: '2026-10-23T17:00:00Z',
    status: 'pending',
    match_format: 'bo5',
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    team1: null,
    team2: null,
  });
  const FINALS = [
    final('pf', 8, 'Petite finale'),
    final('gf', 9, 'Grande finale'),
  ];
  const RACE: RaceMatch[] = PENDING.map(([, t1, t2]) => ({
    team1_id: t1,
    team2_id: t2,
    status: 'pending',
    is_bye: false,
  }));

  it('aux points seuls, Venom et ASHES restaient « en course »', () => {
    const out = buildFinalsPhase({
      standings: STANDINGS,
      finals: FINALS,
      raceMatches: RACE,
    });
    const byId = Object.fromEntries(out.race.map((r) => [r.teamId, r.status]));
    expect(byId.V).toBe('contention');
    expect(byId.A).toBe('contention');
    expect(out.tiebreakersIncluded).toBe(false);
  });

  it('départages compris : Venom qualifiée pour la petite finale, ASHES éliminée', async () => {
    const rankBounds = await computeRankBounds({
      tenantId: TENANT,
      stage: STAGE,
      inputs: inputs(),
      formatOf: bo3,
    });
    const out = buildFinalsPhase({
      standings: STANDINGS,
      finals: FINALS,
      raceMatches: RACE,
      rankBounds,
    });
    expect(out.race.map((r) => [r.teamId, r.status])).toEqual([
      ['H', 'qualified'],
      ['C', 'qualified'],
      ['E', 'qualified'],
      ['V', 'qualified'],
      ['A', 'eliminated'],
      ['S', 'eliminated'],
      ['P', 'eliminated'],
      ['X', 'eliminated'],
    ]);
    // La finale visée : la petite (index 1 des cartes, grande finale d'abord).
    expect(out.race.find((r) => r.teamId === 'V')?.zone).toBe(1);
    expect(out.cards[1].match.id).toBe('pf');
    expect(out.cards[1].slots[1].team?.id).toBe('V');
    expect(out.tiebreakersIncluded).toBe(true);
  });

  it('la vue le dit : sous-titre « départages compris », Venom « Qualifiée »', async () => {
    const rankBounds = await computeRankBounds({
      tenantId: TENANT,
      stage: STAGE,
      inputs: inputs(),
      formatOf: bo3,
    });
    const phase = buildFinalsPhase({
      standings: STANDINGS,
      finals: FINALS,
      raceMatches: RACE,
      rankBounds,
    });
    const html = renderToString(
      createElement(FinalsPhaseView, { phase, tournamentPath: '/tournament/t' })
    );
    expect(html).toContain('départages compris');
    expect(html).not.toContain('départages non compris');
    // La ligne de Venom : son nom, la finale visée, le badge.
    const venomRow = html.slice(
      html.indexOf('href="/team/v"'),
      html.indexOf('href="/team/a"')
    );
    expect(venomRow).toContain('Petite finale');
    expect(venomRow).toContain('Qualifiée');
    expect(venomRow).not.toContain('En course');

    // Sans bornes : l'ancien sous-titre, toujours vrai.
    const fallback = renderToString(
      createElement(FinalsPhaseView, {
        phase: buildFinalsPhase({
          standings: STANDINGS,
          finals: FINALS,
          raceMatches: RACE,
        }),
        tournamentPath: '/tournament/t',
      })
    );
    expect(fallback).toContain('départages non compris');
  });

  it('bornes incomplètes : retour aux points pour tout le tableau', () => {
    const out = buildFinalsPhase({
      standings: STANDINGS,
      finals: FINALS,
      raceMatches: RACE,
      rankBounds: new Map([['V', { best: 4, worst: 4 }]]),
    });
    expect(out.race.find((r) => r.teamId === 'V')?.status).toBe('contention');
    expect(out.tiebreakersIncluded).toBe(false);
  });
});

describe('readFinalsRankBounds — lectures', () => {
  beforeEach(() => {
    resetSupabaseMock();
    store.stage_teams = TEAMS.map((id, i) => ({
      stage_id: STAGE.id,
      team_id: id,
      seed: i + 1,
      disqualified_at: id === 'X' ? '2026-10-08T12:00:00Z' : null,
      disqualification_mode: id === 'X' ? 'forfeit' : null,
      disqualification_reason: null,
      disqualified_by: null,
      team: { id, name: id, slug: id, short_name: null, logo_url: null },
    })) as any;
    store.matches = matchRows().map((m) => ({
      ...m,
      stage_id: STAGE.id,
      scheduled_at: null,
    })) as any;
    store.stage_tiebreaker_overrides = [] as any;
  });

  function pageMatches(format: string | null = 'bo3'): PageMatchRef[] {
    return matchRows().map((m) => ({
      id: m.id,
      stage_id: STAGE.id,
      status: m.status,
      is_bye: m.is_bye,
      match_format: format,
    }));
  }

  it('lit la phase et rend les bornes (Venom 4e, ASHES 5e)', async () => {
    const bounds = await readFinalsRankBounds(TENANT, STAGE, pageMatches());
    expect(bounds?.get('V')).toEqual({ best: 4, worst: 4 });
    expect(bounds?.get('A')).toEqual({ best: 5, worst: 5 });
    expect(bounds?.get('X')).toEqual({ best: 8, worst: 8 });
  });

  it('rien à calculer : saison finie, format non simulable, autre phase', async () => {
    const over = pageMatches().map((m) => ({ ...m, status: 'finished' }));
    expect(await readFinalsRankBounds(TENANT, STAGE, over)).toBeNull();
    expect(
      await readFinalsRankBounds(TENANT, STAGE, pageMatches(null))
    ).toBeNull();
    expect(
      await readFinalsRankBounds(
        TENANT,
        { ...STAGE, stage_type: 'swiss' },
        pageMatches()
      )
    ).toBeNull();
    expect(await readFinalsRankBounds(TENANT, null, pageMatches())).toBeNull();
  });

  it('trop d’issues : pas de calcul', async () => {
    const many: PageMatchRef[] = Array.from({ length: 7 }, (_, i) => ({
      id: `open-${i}`,
      stage_id: STAGE.id,
      status: 'pending',
      is_bye: false,
      match_format: 'bo3',
    }));
    expect(await readFinalsRankBounds(TENANT, STAGE, many)).toBeNull();
  });
});
