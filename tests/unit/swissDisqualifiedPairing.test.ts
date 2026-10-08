// tests/unit/swissDisqualifiedPairing.test.ts — une équipe disqualifiée n'est
// jamais appariée à la ronde suisse suivante.
//
// Règle unique (utils/swiss/pairingPool.ts) vérifiée sur les DEUX chemins :
//   - admin : generateSwissRound (features/admin/stages/service/swiss.ts)
//   - bot   : runSwissNextRound  (utils/swiss/runNextRound.ts)
// + l'état de progression admin (swissStatus).

import { describe, it, expect, beforeEach } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { supabaseAdmin } from '../../utils/supabase';
import { logger } from '../../utils/logger';
import {
  generateSwissRound,
  swissStatus,
} from '../../features/admin/stages/service/swiss';
import { runSwissNextRound } from '../../utils/swiss/runNextRound';
import {
  countedSwissMatches,
  eligibleSwissTeams,
} from '../../utils/swiss/pairingPool';
import type { DisqualificationMap } from '../../utils/stages/disqualification';
import type { ServiceContext } from '../../utils/admin/serviceContext';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAGE = 's1';

type Mode = 'forfeit' | 'annul';
type Pair = { t1: string; t2: string | null; bye: boolean };
type Outcome =
  | { ok: true; pairs: Pair[] }
  | { ok: false; status: number; code?: string; error: string };

function seedStage(settings: Record<string, unknown> = {}) {
  store.tournament_stages = [
    {
      id: STAGE,
      tenant_id: TENANT,
      tournament_id: 'tour-1',
      name: 'Suisse',
      stage_type: 'swiss',
      settings,
    },
  ] as any;
}

/** Inscriptions dans l'ordre des seeds ; `dq` = équipes disqualifiées. */
function seedTeams(ids: string[], dq: Record<string, Mode> = {}) {
  store.stage_teams = ids.map((id, i) => ({
    tenant_id: TENANT,
    stage_id: STAGE,
    team_id: id,
    seed: i + 1,
    disqualified_at: dq[id] ? '2026-10-08T10:00:00Z' : null,
    disqualification_mode: dq[id] ?? null,
    disqualification_reason: null,
    disqualified_by: null,
  })) as any;
  store.teams = ids.map((id) => ({ id, name: id.toUpperCase() })) as any;
}

function match(
  id: string,
  team1: string,
  team2: string | null,
  over: Record<string, unknown> = {}
) {
  return {
    id,
    tenant_id: TENANT,
    tournament_id: 'tour-1',
    stage_id: STAGE,
    status: 'finished',
    is_bye: false,
    round_number: 1,
    team1_id: team1,
    team2_id: team2,
    winner_team_id: team1,
    team1_score: 2,
    team2_score: 0,
    deleted_at: null,
    ...over,
  };
}

const ctx = (): ServiceContext => ({
  db: supabaseAdmin as unknown as ServiceContext['db'],
  tenantId: TENANT,
  actor: { kind: 'system' },
  logger,
});

async function viaAdmin(): Promise<Outcome> {
  try {
    const { result } = await generateSwissRound(ctx(), STAGE, {
      dryRun: true,
    });
    const preview = (result.preview ?? []) as {
      team1_id: string;
      team2_id: string | null;
      is_bye: boolean;
    }[];
    return {
      ok: true,
      pairs: preview.map((p) => ({
        t1: p.team1_id,
        t2: p.team2_id,
        bye: p.is_bye,
      })),
    };
  } catch (err) {
    const e = err as { status: number; legacyCode?: string; message: string };
    return {
      ok: false,
      status: e.status,
      code: e.legacyCode,
      error: e.message,
    };
  }
}

async function viaBot(): Promise<Outcome> {
  const out = await runSwissNextRound({
    tenantId: TENANT,
    stageId: STAGE,
    dryRun: true,
  });
  if (!out.ok) {
    return { ok: false, status: out.status, code: out.code, error: out.error };
  }
  return {
    ok: true,
    pairs: out.preview.map((p) => ({
      t1: p.team1Id,
      t2: p.team2Id,
      bye: p.isBye,
    })),
  };
}

const PATHS = [
  ['admin', viaAdmin],
  ['bot', viaBot],
] as const;

/** Paires normalisées (ordre interne trié) pour comparer sans dépendre de l'ordre. */
function norm(pairs: Pair[]) {
  return pairs
    .map((p) =>
      p.bye ? `BYE:${p.t1}` : [p.t1, p.t2 as string].sort().join('-')
    )
    .sort();
}

beforeEach(() => {
  resetSupabaseMock();
  seedStage();
});

describe('pairingPool — règle partagée', () => {
  const dq: DisqualificationMap = new Map([
    [
      'x',
      {
        teamId: 'x',
        mode: 'annul',
        disqualifiedAt: '2026-10-08',
        reason: null,
        disqualifiedBy: null,
      },
    ],
  ]);

  it('retire les disqualifiées du pool, ordre conservé', () => {
    const pool = eligibleSwissTeams(
      [{ team_id: 'a' }, { team_id: 'x' }, { team_id: 'b' }],
      dq
    );
    expect(pool.map((p) => p.team_id)).toEqual(['a', 'b']);
  });

  it('matchs comptés : forfait oui, annulé / supprimé / ronde future / « annul » non', () => {
    const rows = [
      match('fin', 'a', 'b'),
      match('wo', 'a', 'c', { status: 'walkover' }),
      match('can', 'a', 'b', { status: 'cancelled' }),
      match('del', 'a', 'b', { deleted_at: '2026-10-01' }),
      match('ann', 'a', 'x'),
      match('next', 'a', 'b', { round_number: 3 }),
    ];
    expect(countedSwissMatches(rows, dq, 3).map((m) => m.id)).toEqual([
      'fin',
      'wo',
    ]);
  });
});

describe.each(PATHS)('ronde suisse suivante (%s)', (_name, run) => {
  it("n'apparie jamais une disqualifiée (mode forfait)", async () => {
    seedTeams(['a', 'b', 'c', 'd', 'x'], { x: 'forfeit' });
    store.matches = [
      match('m1', 'a', 'b'),
      match('m2', 'c', 'd'),
      match('m3', 'x', null, { is_bye: true }),
    ] as any;
    const out = await run();
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.pairs).toHaveLength(2);
    expect(out.pairs.some((p) => p.bye)).toBe(false);
    expect(out.pairs.flatMap((p) => [p.t1, p.t2])).not.toContain('x');
  });

  it('pool impair après retrait : BYE à une équipe éligible ; un match annulé de la disqualifiée ne bloque pas la ronde', async () => {
    // x a le seed 1 et 0 point : sans le retrait, c'est elle qui prendrait le BYE.
    seedTeams(['x', 'a', 'b', 'c'], { x: 'annul' });
    store.matches = [
      match('m1', 'a', 'b'),
      match('m2', 'c', 'x', {
        status: 'cancelled',
        winner_team_id: null,
        team1_score: null,
        team2_score: null,
      }),
    ] as any;
    const out = await run();
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // a = 3 pts ; b (seed 3) et c (seed 4) à 0 → BYE à b, a contre c.
    expect(norm(out.pairs)).toEqual(['BYE:b', 'a-c']);
  });

  it('mode « annul » : la victoire contre la disqualifiée ne compte pas pour l’appariement', async () => {
    // Ronde 1 : a bat x, b bat c, d BYE. Ronde 2 attendue :
    //  - annul   : a à 0 pt → b-d (3 pts) et a-c (0 pt)
    //  - forfeit : a à 3 pts → a-b, c-d
    seedTeams(['a', 'b', 'c', 'd', 'x'], { x: 'annul' });
    store.matches = [
      match('m1', 'a', 'x'),
      match('m2', 'b', 'c'),
      match('m3', 'd', null, { is_bye: true }),
    ] as any;
    const annul = await run();
    expect(annul.ok).toBe(true);
    if (!annul.ok) return;
    expect(norm(annul.pairs)).toEqual(['a-c', 'b-d']);

    seedTeams(['a', 'b', 'c', 'd', 'x'], { x: 'forfeit' });
    const forfeit = await run();
    expect(forfeit.ok).toBe(true);
    if (!forfeit.ok) return;
    expect(norm(forfeit.pairs)).toEqual(['a-b', 'c-d']);
  });

  it('match encore ouvert de la disqualifiée : ignoré en « annul », bloquant en « forfeit »', async () => {
    // Le match x-c n'a pas pu être annulé / forfaité (litige) : il reste ouvert.
    const open = () => [
      match('m1', 'a', 'b'),
      match('m2', 'c', 'x', {
        status: 'disputed',
        winner_team_id: null,
        team1_score: null,
        team2_score: null,
      }),
      match('m3', 'd', null, { is_bye: true }),
    ];
    seedTeams(['a', 'b', 'c', 'd', 'x'], { x: 'annul' });
    store.matches = open() as any;
    const annul = await run();
    expect(annul.ok).toBe(true);
    if (!annul.ok) return;
    expect(annul.pairs.flatMap((p) => [p.t1, p.t2])).not.toContain('x');
    expect(annul.pairs).toHaveLength(2);

    seedTeams(['a', 'b', 'c', 'd', 'x'], { x: 'forfeit' });
    store.matches = open() as any;
    const forfeit = await run();
    expect(forfeit.ok).toBe(false);
    if (forfeit.ok) return;
    expect(forfeit.status).toBe(400);
    expect(forfeit.error).toMatch(/1 match\(s\) du round 1/);
  });

  it('moins de 2 équipes éligibles : 400 EMPTY_PAIRING, message explicite', async () => {
    seedTeams(['a', 'x'], { x: 'forfeit' });
    store.matches = [match('m1', 'a', 'x', { status: 'walkover' })] as any;
    const out = await run();
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.code).toBe('EMPTY_PAIRING');
    expect(out.error).toMatch(/1 equipe\(s\) eligible\(s\)/);
    expect(out.error).toMatch(/1 disqualifiee\(s\)/);
    expect(store.matches).toHaveLength(1);
  });
});

describe('swissStatus — disqualifiées hors des équipes actives', () => {
  it('ne compte pas la disqualifiée et ignore ses matchs « annul »', async () => {
    seedTeams(['a', 'b', 'x'], { x: 'annul' });
    store.matches = [
      match('m1', 'a', 'x'),
      match('m2', 'b', null, { is_bye: true }),
    ] as any;
    const st = await swissStatus(ctx(), STAGE);
    expect(st.totalTeamCount).toBe(3);
    expect(st.activeTeamCount).toBe(2);
    expect(st.allCurrentRoundFinished).toBe(true);
    expect(st.canGenerateNext).toBe(true);
  });

  it('un match ouvert de la disqualifiée « annul » ne retient pas la ronde', async () => {
    seedTeams(['a', 'b', 'c', 'x'], { x: 'annul' });
    store.matches = [
      match('m1', 'a', 'b'),
      match('m2', 'c', 'x', { status: 'disputed', winner_team_id: null }),
    ] as any;
    const st = await swissStatus(ctx(), STAGE);
    expect(st.allCurrentRoundFinished).toBe(true);
    expect(st.canGenerateNext).toBe(true);
  });

  it('une seule équipe éligible : rien à générer', async () => {
    seedTeams(['a', 'x'], { x: 'forfeit' });
    store.matches = [match('m1', 'a', 'x', { status: 'walkover' })] as any;
    const st = await swissStatus(ctx(), STAGE);
    expect(st.activeTeamCount).toBe(1);
    expect(st.canGenerateNext).toBe(false);
  });
});
