// Régressions de sécurité — lot B (isolation entre espaces, modules
// matches / stages / tournaments).
//
// Défauts PRÉEXISTANTS signalés pendant les vagues serveur 3-4
// (docs/PLAN-industrialisation-admin.md) : des ids reçus dans l'URL ou le
// corps (match, phase, tournoi, équipe, match suivant…) n'étaient pas recoupés
// avec l'espace du staff. Règle : recoupement AVANT toute écriture, sinon
// refus et rien d'écrit ; même espace → comportement inchangé.
//
// Pour chaque point : un cas refusé (id d'un autre espace / champ hors liste
// blanche), un cas autorisé.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/botEvents', async (orig) => ({
  ...(await orig<typeof import('../../utils/botEvents')>()),
  emitBotEvent: vi.fn(async () => undefined),
}));
vi.mock('@/utils/castEvents', async (orig) => ({
  ...(await orig<typeof import('../../utils/castEvents')>()),
  emitCastEvent: vi.fn(async () => undefined),
}));
vi.mock('@/utils/broadcast/autoDirector', async (orig) => ({
  ...(await orig<typeof import('../../utils/broadcast/autoDirector')>()),
  reactToMatchStatus: vi.fn(async () => undefined),
}));

import {
  store,
  resetSupabaseMock,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import type { ServiceContext } from '../../utils/admin/serviceContext';

import {
  cancelDispute,
  openDispute,
} from '../../features/admin/matches/service/dispute';
import { assignCaster } from '../../features/admin/matches/service/castAssignments';
import {
  actOnLineup,
  getLineups,
} from '../../features/admin/matches/service/lineup';
import { updateMatch } from '../../features/admin/matches/service/match';
import {
  autoByes,
  batchScores,
  bulkUndo,
} from '../../features/admin/stages/service/matchOps';
import { cloneStage } from '../../features/admin/stages/service/stage';
import { addStageTeam } from '../../features/admin/stages/service/teams';
import {
  createMatches,
  runBracketAction,
} from '../../features/admin/tournaments/service/matches';
import { upsertWebhook } from '../../features/admin/tournaments/service/ops';
import {
  addEntry,
  deleteEntry,
  getEntry,
  patchEntry,
} from '../../features/admin/tournaments/service/teams';
import {
  DashboardQuery,
  TournamentTeamsQuery,
} from '../../features/admin/tournaments/schemas';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ME = '55555555-5555-4555-8555-555555555555';
const TOURN_A = '3a3a3a3a-3333-4333-8333-333333333333';
const TOURN_A2 = '3a3a3a3a-3333-4333-8333-3333333333a2';
const TOURN_B = '3b3b3b3b-3333-4333-8333-333333333333';
const STAGE_A = '4a4a4a4a-4444-4444-8444-444444444444';
const STAGE_B = '4b4b4b4b-4444-4444-8444-444444444444';
const MATCH_A = '6a6a6a6a-6666-4666-8666-666666666666';
const MATCH_A2 = '6a6a6a6a-6666-4666-8666-6666666666a2';
const MATCH_B = '6b6b6b6b-6666-4666-8666-666666666666';
const TEAM_A1 = '1a1a1a1a-1111-4111-8111-111111111111';
const TEAM_A2 = '1a1a1a1a-1111-4111-8111-1111111111a2';
const TEAM_B = '1b1b1b1b-1111-4111-8111-111111111111';
const CASTER_A = '7a7a7a7a-7777-4777-8777-777777777777';
const ENTRY_A = '8a8a8a8a-8888-4888-8888-888888888888';
const ENTRY_A2 = '8a8a8a8a-8888-4888-8888-8888888888a2';
const WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abcDEF';

type Row = Record<string, unknown>;

const logger = { error() {}, warn() {}, info() {}, debug() {} } as never;
function svc(tenantId = TENANT_A): ServiceContext {
  return {
    db: supabaseAdmin as never,
    tenantId,
    actor: { kind: 'staff', staffId: ME, userId: 'user-me' },
    logger,
  };
}

async function rejects(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    return err as { status?: number; message: string; legacyCode?: string };
  }
  throw new Error('attendu : refus');
}

const rows = (t: string) => (store[t] ?? []) as Row[];
const byId = (t: string, id: string) => rows(t).find((r) => r.id === id);

function seedBase() {
  store.tournaments = [
    { id: TOURN_A, tenant_id: TENANT_A, name: 'A', status: 'ongoing' },
    { id: TOURN_A2, tenant_id: TENANT_A, name: 'A2', status: 'ongoing' },
    { id: TOURN_B, tenant_id: TENANT_B, name: 'B', status: 'ongoing' },
  ];
  store.tournament_stages = [
    {
      id: STAGE_A,
      tenant_id: TENANT_A,
      tournament_id: TOURN_A,
      name: 'Phase A',
      slug: 'phase-a',
      stage_type: 'single_elimination',
      order_index: 0,
      settings: {},
    },
    {
      id: STAGE_B,
      tenant_id: TENANT_B,
      tournament_id: TOURN_B,
      name: 'Phase B',
      slug: 'phase-b',
      stage_type: 'single_elimination',
      order_index: 0,
      settings: {},
    },
  ];
  store.teams = [
    { id: TEAM_A1, tenant_id: TENANT_A, name: 'Alpha' },
    { id: TEAM_A2, tenant_id: TENANT_A, name: 'Bravo' },
    { id: TEAM_B, tenant_id: TENANT_B, name: 'Intruse' },
  ];
  store.matches = [
    {
      id: MATCH_A,
      tenant_id: TENANT_A,
      tournament_id: TOURN_A,
      stage_id: STAGE_A,
      status: 'pending',
      round_number: 1,
      team1_id: TEAM_A1,
      team2_id: null,
      is_bye: false,
      scheduled_at: '2026-10-01T18:00:00.000Z',
    },
    {
      id: MATCH_A2,
      tenant_id: TENANT_A,
      tournament_id: TOURN_A,
      stage_id: STAGE_A,
      status: 'pending',
      round_number: 2,
      team1_id: null,
      team2_id: null,
      is_bye: false,
    },
    {
      id: MATCH_B,
      tenant_id: TENANT_B,
      tournament_id: TOURN_B,
      stage_id: STAGE_B,
      status: 'pending',
      round_number: 1,
      team1_id: TEAM_B,
      team2_id: null,
      is_bye: false,
      scheduled_at: '2026-10-01T18:00:00.000Z',
    },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  seedBase();
});

/* 1. Litiges ------------------------------------------------------------- */

describe('1. litiges de match : lecture et écriture sous le tenant', () => {
  it('refusé : ouvrir / annuler le litige d’un match d’un autre espace → 404', async () => {
    const err = await rejects(
      openDispute(svc(), MATCH_B, { reason: 'triche' })
    );
    expect(err.status).toBe(404);
    expect(err.message).toBe('Match not found');
    expect(byId('matches', MATCH_B)?.status).toBe('pending');

    byId('matches', MATCH_B)!.status = 'disputed';
    const err2 = await rejects(cancelDispute(svc(), MATCH_B, undefined));
    expect(err2.status).toBe(404);
    expect(byId('matches', MATCH_B)?.status).toBe('disputed');
  });

  it('autorisé : litige ouvert sur un match de son espace', async () => {
    const out = await openDispute(svc(), MATCH_A, { reason: 'triche' });
    expect(out.audit).toMatchObject({ entity_id: MATCH_A });
    expect(byId('matches', MATCH_A)?.status).toBe('disputed');
  });
});

/* 2. cast-assignments ---------------------------------------------------- */

describe('2. cast-assignments POST : matchId recoupé avec le tenant', () => {
  beforeEach(() => {
    store.cast_members = [
      { id: CASTER_A, tenant_id: TENANT_A, is_active: true },
    ];
    store.cast_assignments = [];
  });
  const briefingAt = () => new Date(Date.now() + 3_600_000).toISOString();

  it('refusé : match d’un autre espace → 404, aucune assignation', async () => {
    const err = await rejects(
      assignCaster(svc(), MATCH_B, {
        castMemberId: CASTER_A,
        briefingAt: briefingAt(),
      })
    );
    expect(err.status).toBe(404);
    expect(rows('cast_assignments')).toHaveLength(0);
  });

  it('autorisé : match de son espace', async () => {
    await assignCaster(svc(), MATCH_A, {
      castMemberId: CASTER_A,
      briefingAt: briefingAt(),
    });
    expect(rows('cast_assignments')).toHaveLength(1);
    expect(rows('cast_assignments')[0]).toMatchObject({
      tenant_id: TENANT_A,
      match_id: MATCH_A,
    });
  });
});

/* 3. lineups ------------------------------------------------------------- */

describe('3. lineups : feuilles et équipes lues / écrites sous le tenant', () => {
  beforeEach(() => {
    // Donnée incohérente plantée : une feuille et une équipe d'un AUTRE
    // espace pointant le match A (même ids).
    byId('matches', MATCH_A)!.team2_id = TEAM_B;
    store.match_lineups = [
      {
        tenant_id: TENANT_B,
        match_id: MATCH_A,
        team_id: TEAM_B,
        status: 'validated',
        validated_by_kind: 'admin',
      },
      {
        tenant_id: TENANT_A,
        match_id: MATCH_A,
        team_id: TEAM_A1,
        status: 'validated',
        validated_by_kind: 'admin',
      },
    ];
  });

  it('refusé : la feuille et le nom d’équipe d’un autre espace restent invisibles et intacts', async () => {
    const view = await getLineups(svc(), MATCH_A);
    const foreign = view.lineups.find((l) => l.teamId === TEAM_B);
    expect(foreign?.teamName).toBeNull();
    expect(foreign?.status).toBe('draft');

    await actOnLineup(svc(), 'user-me', MATCH_A, {
      teamId: TEAM_B,
      reopen: true,
    });
    expect(
      rows('match_lineups').find((l) => l.tenant_id === TENANT_B)?.status
    ).toBe('validated');
  });

  it('autorisé : réouverture de la feuille de son espace', async () => {
    const view = await getLineups(svc(), MATCH_A);
    expect(view.lineups.find((l) => l.teamId === TEAM_A1)?.teamName).toBe(
      'Alpha'
    );
    await actOnLineup(svc(), 'user-me', MATCH_A, {
      teamId: TEAM_A1,
      reopen: true,
    });
    expect(
      rows('match_lineups').find((l) => l.tenant_id === TENANT_A)?.status
    ).toBe('draft');
  });
});

/* 4. [matchId] PATCH ----------------------------------------------------- */

describe('4. [matchId] PATCH : tournoi lu sous le tenant, références recoupées', () => {
  const hooks = { afterScore: async () => undefined };

  it('refusé : stage_id / next_match_win_id d’un autre espace → 400 CROSS_TENANT_REF, rien d’écrit', async () => {
    for (const body of [
      { stage_id: STAGE_B },
      { next_match_win_id: MATCH_B },
    ]) {
      const err = await rejects(updateMatch(svc(), MATCH_A, body, hooks));
      expect(err.status).toBe(400);
      expect(err.legacyCode).toBe('CROSS_TENANT_REF');
    }
    expect(byId('matches', MATCH_A)?.stage_id).toBe(STAGE_A);
    expect(byId('matches', MATCH_A)?.next_match_win_id).toBeUndefined();
  });

  it('refusé : le statut d’un tournoi d’un autre espace n’est jamais lu ; celui de son espace l’est', async () => {
    // Match (corrompu) pointant un tournoi d'un autre espace : ce tournoi
    // n'est pas consulté (le garde « terminé » ne lit que son espace).
    byId('matches', MATCH_A)!.tournament_id = TOURN_B;
    byId('tournaments', TOURN_B)!.status = 'completed';
    await updateMatch(svc(), MATCH_A, { notes: 'ok' }, hooks);
    expect(byId('matches', MATCH_A)?.notes).toBe('ok');

    // Tournoi de l'espace terminé → garde 403 (lecture scopée toujours là).
    byId('matches', MATCH_A)!.tournament_id = TOURN_A;
    byId('tournaments', TOURN_A)!.status = 'completed';
    const err = await rejects(
      updateMatch(svc(), MATCH_A, { notes: 'x' }, hooks)
    );
    expect(err.status).toBe(403);
  });

  it('autorisé : références de son espace', async () => {
    await updateMatch(
      svc(),
      MATCH_A,
      { next_match_win_id: MATCH_A2, next_match_win_slot: 1 },
      hooks
    );
    expect(byId('matches', MATCH_A)?.next_match_win_id).toBe(MATCH_A2);
  });
});

/* 5. auto-byes / batch-scores ------------------------------------------- */

describe('5. auto-byes, batch-scores : phase, tournoi et matchs sous le tenant', () => {
  it('refusé : phase d’un autre espace → 404, ses matchs intacts', async () => {
    const err = await rejects(autoByes(svc(), STAGE_B, { propagate: false }));
    expect(err.status).toBe(404);
    expect(byId('matches', MATCH_B)?.is_bye).toBe(false);

    const err2 = await rejects(
      batchScores(svc(), STAGE_B, {
        scores: [{ matchId: MATCH_B, team1Score: 2, team2Score: 0 }],
      })
    );
    expect(err2.status).toBe(404);
  });

  it('refusé : un match d’un autre espace glissé dans la phase de son espace → 400', async () => {
    // Même stage_id que la phase A, mais tenant B : invisible.
    byId('matches', MATCH_B)!.stage_id = STAGE_A;
    const err = await rejects(
      batchScores(svc(), STAGE_A, {
        scores: [{ matchId: MATCH_B, team1Score: 2, team2Score: 0 }],
      })
    );
    expect(err.status).toBe(400);
    expect(byId('matches', MATCH_B)?.status).toBe('pending');
  });

  it('autorisé : BYE posé dans sa phase', async () => {
    const out = await autoByes(svc(), STAGE_A, { propagate: false });
    expect(out.result.updatedMatchIds).toEqual([MATCH_A]);
    expect(byId('matches', MATCH_A)).toMatchObject({
      is_bye: true,
      status: 'finished',
      winner_team_id: TEAM_A1,
    });
  });
});

/* 6. bulk-matches undo --------------------------------------------------- */

describe('6. bulk-matches undo : liste blanche + matchs de la phase', () => {
  const undo = (type: string, snapshots: unknown[]) => ({
    action: 'undo',
    undoPayload: { type, snapshots },
  });

  it('refusé : champ hors liste blanche → 400, rien d’écrit', async () => {
    for (const [type, fields] of [
      ['bulk_schedule', { scheduled_at: null, team1_id: TEAM_B }],
      ['bulk_update', { tenant_id: TENANT_B }],
      ['bulk_cancel', { winner_team_id: TEAM_B }],
    ] as const) {
      const err = await rejects(
        bulkUndo(svc(), STAGE_A, undo(type, [{ matchId: MATCH_A, fields }]))
      );
      expect(err.status).toBe(400);
    }
    const err = await rejects(
      bulkUndo(
        svc(),
        STAGE_A,
        undo('bulk_hack', [{ matchId: MATCH_A, fields: { notes: 'x' } }])
      )
    );
    expect(err.status).toBe(400);
    expect(byId('matches', MATCH_A)).toMatchObject({
      team1_id: TEAM_A1,
      tenant_id: TENANT_A,
      scheduled_at: '2026-10-01T18:00:00.000Z',
    });
  });

  it('refusé : match d’un autre espace → 400, rien d’écrit', async () => {
    const err = await rejects(
      bulkUndo(
        svc(),
        STAGE_A,
        undo('bulk_schedule', [
          { matchId: MATCH_A, fields: { scheduled_at: null } },
          { matchId: MATCH_B, fields: { scheduled_at: null } },
        ])
      )
    );
    expect(err.status).toBe(400);
    expect(byId('matches', MATCH_A)?.scheduled_at).toBe(
      '2026-10-01T18:00:00.000Z'
    );
    expect(byId('matches', MATCH_B)?.scheduled_at).toBe(
      '2026-10-01T18:00:00.000Z'
    );
  });

  it('autorisé : restauration d’un créneau et d’une annulation dans sa phase', async () => {
    const at = '2026-10-02T18:00:00.000Z';
    const out = await bulkUndo(
      svc(),
      STAGE_A,
      undo('bulk_schedule', [
        { matchId: MATCH_A, fields: { scheduled_at: at } },
      ])
    );
    expect(out.result).toMatchObject({ success: true, successCount: 1 });
    expect(byId('matches', MATCH_A)?.scheduled_at).toBe(at);

    byId('matches', MATCH_A)!.status = 'cancelled';
    await bulkUndo(
      svc(),
      STAGE_A,
      undo('bulk_cancel', [
        {
          matchId: MATCH_A,
          fields: {
            status: 'finished',
            team1_score: 2,
            team2_score: 0,
            winner_team_id: TEAM_A1,
          },
        },
      ])
    );
    expect(byId('matches', MATCH_A)).toMatchObject({
      status: 'finished',
      winner_team_id: TEAM_A1,
    });
  });
});

/* 7. clone --------------------------------------------------------------- */

describe('7. clone de phase : targetTournamentId du tenant', () => {
  it('refusé : tournoi cible d’un autre espace → 404, aucune phase créée', async () => {
    const before = rows('tournament_stages').length;
    const err = await rejects(
      cloneStage(svc(), STAGE_A, { targetTournamentId: TOURN_B })
    );
    expect(err.status).toBe(404);
    expect(rows('tournament_stages')).toHaveLength(before);
  });

  it('autorisé : tournoi cible de son espace', async () => {
    await cloneStage(svc(), STAGE_A, { targetTournamentId: TOURN_A2 });
    const clone = rows('tournament_stages').find(
      (s) => s.tournament_id === TOURN_A2
    );
    expect(clone).toMatchObject({ tenant_id: TENANT_A, is_active: false });
  });
});

/* 8. stage teams POST ---------------------------------------------------- */

describe('8. stage teams POST : teamId du tenant', () => {
  beforeEach(() => {
    store.stage_teams = [];
  });

  it('refusé : équipe d’un autre espace → 404, rien d’inscrit', async () => {
    const err = await rejects(addStageTeam(svc(), STAGE_A, { teamId: TEAM_B }));
    expect(err.status).toBe(404);
    expect(rows('stage_teams')).toHaveLength(0);
  });

  it('autorisé : équipe de son espace', async () => {
    await addStageTeam(svc(), STAGE_A, { teamId: TEAM_A1 });
    expect(rows('stage_teams')).toHaveLength(1);
    expect(rows('stage_teams')[0]).toMatchObject({
      stage_id: STAGE_A,
      team_id: TEAM_A1,
    });
  });
});

/* 9. bracket / matches POST --------------------------------------------- */

describe('9. bracket (generate / validate) et matches POST : références recoupées', () => {
  const count = () => rows('matches').length;

  it('refusé : tournoi de l’URL d’un autre espace → 404, rien d’inséré', async () => {
    const n = count();
    const err = await rejects(
      createMatches(svc(), TOURN_B, { matches: [{ round_number: 1 }] })
    );
    expect(err.status).toBe(404);
    const err2 = await rejects(
      runBracketAction(svc(), TOURN_B, { action: 'generate', size: 4 })
    );
    expect(err2.status).toBe(404);
    expect(count()).toBe(n);
  });

  it('refusé : stage_id / team*_id / next_match_*_id d’un autre espace → 404, rien d’inséré', async () => {
    const n = count();
    for (const m of [
      { stage_id: STAGE_B },
      { team1_id: TEAM_B },
      { team2_id: TEAM_B },
      { next_match_win_id: MATCH_B },
      { next_match_lose_id: MATCH_B },
    ]) {
      const err = await rejects(
        createMatches(svc(), TOURN_A, { matches: [{ round_number: 1, ...m }] })
      );
      expect(err.status).toBe(404);
      expect(err.legacyCode).toBe('CROSS_TENANT_REF');
    }
    for (const action of ['generate', 'validate']) {
      const err = await rejects(
        runBracketAction(svc(), TOURN_A, { action, size: 4, stageId: STAGE_B })
      );
      expect(err.status).toBe(404);
    }
    // save : une équipe étrangère n'est jamais placée.
    const err = await rejects(
      runBracketAction(svc(), TOURN_A, {
        action: 'save',
        matches: [{ id: MATCH_A2, team1_id: TEAM_B }],
      })
    );
    expect(err.status).toBe(404);
    expect(byId('matches', MATCH_A2)?.team1_id).toBeNull();
    expect(count()).toBe(n);
  });

  it('autorisé : références de son espace', async () => {
    const n = count();
    await createMatches(svc(), TOURN_A, {
      matches: [
        {
          stage_id: STAGE_A,
          round_number: 1,
          team1_id: TEAM_A1,
          team2_id: TEAM_A2,
          next_match_win_id: MATCH_A2,
          next_match_win_slot: 1,
        },
      ],
    });
    expect(count()).toBe(n + 1);
    const out = await runBracketAction(svc(), TOURN_A, {
      action: 'validate',
      stageId: STAGE_A,
    });
    expect(out.response.status).toBe(200);
  });
});

/* 10. discord-webhooks PUT ---------------------------------------------- */

describe('10. discord-webhooks PUT : tournoi de l’URL du tenant', () => {
  beforeEach(() => {
    store.discord_webhooks = [];
  });

  it('refusé : tournoi d’un autre espace → 404, aucun webhook', async () => {
    const err = await rejects(
      upsertWebhook(svc(), TOURN_B, {
        channelType: 'match_results',
        webhookUrl: WEBHOOK_URL,
      })
    );
    expect(err.status).toBe(404);
    expect(rows('discord_webhooks')).toHaveLength(0);
  });

  it('autorisé : tournoi de son espace', async () => {
    await upsertWebhook(svc(), TOURN_A, {
      channelType: 'match_results',
      webhookUrl: WEBHOOK_URL,
    });
    expect(rows('discord_webhooks')).toHaveLength(1);
    expect(rows('discord_webhooks')[0]).toMatchObject({
      tenant_id: TENANT_A,
      tournament_id: TOURN_A,
    });
  });
});

/* 11. tournament teams/[teamId] + UUID ----------------------------------- */

describe('11. inscription du tournoi de l’URL ; UUID validés', () => {
  beforeEach(() => {
    store.tournament_teams = [
      {
        id: ENTRY_A,
        tenant_id: TENANT_A,
        tournament_id: TOURN_A,
        team_id: TEAM_A1,
        seed: 1,
        status: 'registered',
      },
      {
        id: ENTRY_A2,
        tenant_id: TENANT_A,
        tournament_id: TOURN_A2,
        team_id: TEAM_A2,
        seed: 2,
        status: 'registered',
      },
    ];
  });

  it('refusé : inscription d’un AUTRE tournoi (même espace) → 404, rien d’écrit', async () => {
    expect((await rejects(getEntry(svc(), TOURN_A, ENTRY_A2))).status).toBe(
      404
    );
    expect(
      (await rejects(patchEntry(svc(), TOURN_A, ENTRY_A2, { seed: 9 }))).status
    ).toBe(404);
    expect((await rejects(deleteEntry(svc(), TOURN_A, ENTRY_A2))).status).toBe(
      404
    );
    expect(byId('tournament_teams', ENTRY_A2)).toMatchObject({ seed: 2 });
  });

  it('refusé : UUID invalides → 400 historique', async () => {
    const err = await rejects(addEntry(svc(), TOURN_A, { team_id: 'abc' }));
    expect(err.status).toBe(400);
    expect(err.message).toBe('team_id is required');
    const teams = TournamentTeamsQuery.safeParse({ id: 'pas-un-uuid' });
    expect(teams.success).toBe(false);
    expect(teams.error?.issues[0]?.message).toBe('Invalid tournament ID');
    const dash = DashboardQuery.safeParse({ id: 'pas-un-uuid' });
    expect(dash.success).toBe(false);
    expect(dash.error?.issues[0]?.message).toBe('Invalid tournament id');
  });

  it('autorisé : inscription du tournoi de l’URL ; UUID valides', async () => {
    expect((await getEntry(svc(), TOURN_A, ENTRY_A)).team).toBeTruthy();
    await patchEntry(svc(), TOURN_A, ENTRY_A, { seed: 7 });
    expect(byId('tournament_teams', ENTRY_A)).toMatchObject({ seed: 7 });
    await deleteEntry(svc(), TOURN_A, ENTRY_A);
    expect(byId('tournament_teams', ENTRY_A)).toBeUndefined();
    expect(TournamentTeamsQuery.safeParse({ id: TOURN_A }).success).toBe(true);
    expect(DashboardQuery.safeParse({ id: TOURN_A }).success).toBe(true);
  });
});
