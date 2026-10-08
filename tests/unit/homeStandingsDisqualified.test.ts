// tests/unit/homeStandingsDisqualified.test.ts — le mini-classement de
// l'accueil et la disqualification d'une équipe de phase.
//
// L'accueil ne recalcule rien : il lit le classement public
// (`readPublicStandings` → `computeStageStandings`). Ce qui se vérifie ici :
//
//   - la disqualifiée est classée en DERNIER et marquée (`disqualified`,
//     `disqualificationMode`), dans les deux modes ;
//   - mode `annul` : ses matchs sont ignorés pour TOUT le monde (victoires,
//     joués, maps) ; mode `forfeit` : ils comptent ;
//   - un forfait compte, un match annulé ou supprimé non ;
//   - le composant pose le badge public « Disqualifiée » sur sa ligne, et
//     seulement sur elle.
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo).

import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { invalidateAllStandingsCache } from '../../utils/stages/standingsCache';
import {
  loadHomeStandings,
  toHomeStandingRows,
  type HomeStandingRow,
} from '../../utils/home/loadHomeData';
import HomeStandings from '../../components/Home/HomeStandings';
import FinalsPhaseView from '../../components/tournament/FinalsPhaseView';
import { buildFinalsPhase } from '../../utils/tournament/finalsPhase';
import type { PublicStandingRow } from '../../utils/stages/publicStandings';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURNAMENT = 'tour-home';
const STAGE = 'stage-home';
const [A, B, C] = ['team-a', 'team-b', 'team-c'];
const NAMES: Record<string, string> = {
  [A]: 'Alpha',
  [B]: 'Beta',
  [C]: 'Gamma',
};

function seed() {
  store.tournament_stages = [
    {
      id: STAGE,
      tournament_id: TOURNAMENT,
      name: 'Saison régulière',
      stage_type: 'round_robin',
      order_index: 0,
      settings: {},
    },
  ] as any;
  store.stage_teams = [A, B, C].map((id, i) => ({
    stage_id: STAGE,
    team_id: id,
    seed: i + 1,
    is_substitute: false,
    disqualified_at: null,
    disqualification_mode: null,
    disqualification_reason: null,
    disqualified_by: null,
    team: {
      id,
      name: NAMES[id],
      slug: id,
      short_name: null,
      logo_url: null,
    },
  })) as any;
}

function match(
  id: string,
  team1: string,
  team2: string,
  over: Record<string, unknown>
) {
  return {
    id,
    tournament_id: TOURNAMENT,
    stage_id: STAGE,
    status: 'finished',
    is_bye: false,
    round_number: 1,
    team1_id: team1,
    team2_id: team2,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    deleted_at: null,
    scheduled_at: null,
    group_key: null,
    ...over,
  };
}

/**
 * Alpha a tout gagné (dont un forfait) ; Beta bat Gamma. Un match annulé et
 * un supprimé donneraient Gamma gagnante s'ils comptaient.
 */
function seedPlayed() {
  store.matches = [
    match('p1', A, B, {
      winner_team_id: A,
      team1_score: 2,
      team2_score: 0,
    }),
    match('p2', A, C, {
      status: 'walkover',
      winner_team_id: A,
      team1_score: 2,
      team2_score: 0,
    }),
    match('p3', B, C, {
      winner_team_id: B,
      team1_score: 2,
      team2_score: 1,
    }),
    match('x1', C, B, {
      status: 'cancelled',
      winner_team_id: C,
      team1_score: 2,
      team2_score: 0,
    }),
    match('x2', C, B, {
      winner_team_id: C,
      team1_score: 2,
      team2_score: 0,
      deleted_at: '2026-10-01T00:00:00Z',
    }),
  ] as any;
}

function disqualify(teamId: string, mode: 'forfeit' | 'annul') {
  const row = (store.stage_teams as any[]).find((r) => r.team_id === teamId);
  Object.assign(row, {
    disqualified_at: '2026-10-08T12:00:00Z',
    disqualification_mode: mode,
    disqualification_reason: 'Triche avérée',
  });
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateAllStandingsCache();
});

describe('loadHomeStandings — sans disqualification', () => {
  it('forfait compté, annulé et supprimé ignorés ; aucune ligne marquée', async () => {
    seed();
    seedPlayed();
    const rows = await loadHomeStandings(TENANT, TOURNAMENT);
    expect(rows.map((r) => r.teamId)).toEqual([A, B, C]);
    expect(rows[0]).toMatchObject({ wins: 2, losses: 0, played: 2, diff: 4 });
    expect(rows[2]).toMatchObject({ wins: 0, losses: 2, played: 2 });
    expect(rows.every((r) => r.disqualified === false)).toBe(true);
    expect(rows.every((r) => r.disqualificationMode === null)).toBe(true);
  });
});

describe('loadHomeStandings — équipe disqualifiée', () => {
  it('forfeit : ses matchs comptent, mais elle est classée en dernier et marquée', async () => {
    seed();
    seedPlayed();
    disqualify(A, 'forfeit');
    const rows = await loadHomeStandings(TENANT, TOURNAMENT);
    expect(rows.map((r) => r.teamId)).toEqual([B, C, A]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    // Les défaites contre Alpha restent au bilan des autres.
    expect(rows[0]).toMatchObject({ teamId: B, wins: 1, losses: 1 });
    expect(rows[1]).toMatchObject({ teamId: C, wins: 0, losses: 2 });
    expect(rows[2]).toMatchObject({
      teamId: A,
      wins: 2,
      disqualified: true,
      disqualificationMode: 'forfeit',
    });
  });

  it('annul : tous ses matchs sont ignorés, pour toutes les équipes', async () => {
    seed();
    seedPlayed();
    disqualify(A, 'annul');
    const rows = await loadHomeStandings(TENANT, TOURNAMENT);
    expect(rows.map((r) => r.teamId)).toEqual([B, C, A]);
    expect(rows[0]).toMatchObject({
      teamId: B,
      wins: 1,
      losses: 0,
      played: 1,
      diff: 1,
      disqualified: false,
    });
    expect(rows[1]).toMatchObject({ teamId: C, wins: 0, losses: 1, played: 1 });
    expect(rows[2]).toMatchObject({
      teamId: A,
      wins: 0,
      losses: 0,
      played: 0,
      diff: 0,
      points: 0,
      disqualified: true,
      disqualificationMode: 'annul',
    });
  });

  it('annul : si seuls ses matchs avaient été joués, le bloc disparaît', async () => {
    seed();
    store.matches = [
      match('p1', A, B, { winner_team_id: A, team1_score: 2, team2_score: 0 }),
    ] as any;
    disqualify(A, 'annul');
    expect(await loadHomeStandings(TENANT, TOURNAMENT)).toEqual([]);
  });
});

describe('toHomeStandingRows', () => {
  it('rien tant que personne n’a joué (ordre d’inscription)', () => {
    expect(
      toHomeStandingRows([
        {
          rank: 1,
          teamId: A,
          teamName: 'Alpha',
          shortName: null,
          slug: null,
          logoUrl: null,
          played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          points: 0,
          mapsWon: 0,
          mapsLost: 0,
          form: [],
          tiebrokenBy: null,
          disqualified: false,
          disqualificationMode: null,
        },
      ])
    ).toEqual([]);
  });
});

describe('<HomeStandings /> — badge', () => {
  function row(over: Partial<HomeStandingRow>): HomeStandingRow {
    return {
      rank: 1,
      teamId: A,
      name: 'Alpha',
      shortName: null,
      slug: 'alpha',
      logoUrl: null,
      played: 2,
      wins: 2,
      losses: 0,
      points: 6,
      diff: 4,
      disqualified: false,
      disqualificationMode: null,
      ...over,
    };
  }

  function render(rows: HomeStandingRow[]): string {
    return renderToString(createElement(HomeStandings, { rows }));
  }

  it('badge sur la seule ligne disqualifiée, avec l’info-bulle du mode', () => {
    const html = render([
      row({ rank: 1, teamId: B, name: 'Beta', slug: 'beta' }),
      row({
        rank: 2,
        teamId: A,
        name: 'Alpha',
        slug: null,
        disqualified: true,
        disqualificationMode: 'annul',
      }),
    ]);
    expect(html.match(/data-testid="public-disqualified-badge"/g)).toHaveLength(
      1
    );
    expect(html).toContain('Disqualifiée');
    expect(html).toContain('ses résultats ne comptent plus au classement');
    // Le badge suit le nom de l'équipe disqualifiée, pas celui de Beta.
    expect(html.indexOf('Disqualifiée')).toBeGreaterThan(html.indexOf('Alpha'));
  });

  it('mode forfeit : info-bulle des matchs perdus par forfait (ligne liée)', () => {
    const html = render([
      row({ disqualified: true, disqualificationMode: 'forfeit' }),
    ]);
    expect(html).toContain('ses matchs restants sont perdus par forfait');
    expect(html).toContain('href="/team/alpha"');
  });

  it('aucun badge sans disqualification', () => {
    const html = render([row({}), row({ teamId: B, name: 'Beta', rank: 2 })]);
    expect(html).not.toContain('public-disqualified-badge');
  });
});

// Même règle sur la course aux finales (onglet Bracket d'un championnat) :
// « éliminée » seul laisserait croire à une course perdue aux points.
describe('<FinalsPhaseView /> — badge dans la course aux finales', () => {
  function raceRow(
    rank: number,
    id: string,
    wins: number,
    over: Partial<PublicStandingRow> = {}
  ): PublicStandingRow {
    return {
      rank,
      teamId: id,
      teamName: NAMES[id],
      shortName: null,
      slug: id,
      logoUrl: null,
      played: 2,
      wins,
      losses: 2 - wins,
      draws: 0,
      points: wins * 3,
      mapsWon: wins * 2,
      mapsLost: (2 - wins) * 2,
      form: [],
      tiebrokenBy: null,
      disqualified: false,
      disqualificationMode: null,
      ...over,
    };
  }

  it('la disqualifiée est éliminée ET badgée ; les autres non', () => {
    const phase = buildFinalsPhase({
      standings: [
        raceRow(1, B, 1),
        raceRow(2, C, 0),
        raceRow(3, A, 2, {
          disqualified: true,
          disqualificationMode: 'forfeit',
        }),
      ],
      finals: [
        {
          id: 'gf',
          round_number: 9,
          round_name: 'Grande finale',
          scheduled_at: '2026-10-23T18:30:00Z',
          status: 'pending',
          match_format: 'bo5',
          team1_score: null,
          team2_score: null,
          winner_team_id: null,
          team1: null,
          team2: null,
        },
      ],
      raceMatches: [],
    });
    expect(phase.race.find((r) => r.teamId === A)?.status).toBe('eliminated');
    const html = renderToString(
      createElement(FinalsPhaseView, {
        phase,
        tournamentPath: '/tournament/t',
      })
    );
    expect(html.match(/data-testid="public-disqualified-badge"/g)).toHaveLength(
      1
    );
    expect(html).toContain('ses matchs restants sont perdus par forfait');
  });
});
