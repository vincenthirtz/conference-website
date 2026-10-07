// tests/unit/forfeitProposal.test.ts
//
// PROPOSITION DE FORFAIT (règle du 2026-10-07) : le cron de check-in ne
// forfait plus, il propose ; les admins tranchent. Ce que ces tests gardent :
//
//   1. CONFIRMER applique le forfait EXACTEMENT comme le faisait le cron
//      (requiredWins-0, `walkover`, vainqueur, équipe forfait) — avec le vrai
//      applyMatchScore, pas un double.
//   2. REFUSER ne touche à rien sur le match.
//   3. Une proposition déjà tranchée répond NOT_PENDING avec son état — le
//      bot s'en sert pour éditer le DM.
//   4. Une saisie de score par le STAFF écrase la proposition ; un report de
//      capitaine (staffId nul) non.
//   5. Les destinataires sont les admins/owners EFFECTIFS du tenant, actifs,
//      au compte Discord lié.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  notifyCheckinForfeit: vi.fn(async () => undefined),
  sendCheckinForfeitEmail: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock('../../utils/bracket/propagate', () => ({
  resetPropagationForMatch: vi.fn(async () => undefined),
  propagateBracketForMatch: vi.fn(async (_t: string, matchId: string) => ({
    matchId,
    winnerTeamId: null,
    loserTeamId: null,
    updatedWinMatchId: null,
    updatedLoseMatchId: null,
  })),
  snapshotPropagationSlots: vi.fn(async () => null),
  restorePropagationSlots: vi.fn(async () => undefined),
  computeWinnerLoserFromMatch: () => ({
    winnerTeamId: null,
    loserTeamId: null,
  }),
}));
vi.mock('../../utils/staffLogs', () => ({
  logStaffAction: vi.fn(async () => undefined),
}));
vi.mock('../../utils/stages/autoAdvance', () => ({
  tryAutoAdvanceFromMatch: vi.fn(async () => undefined),
}));
vi.mock('../../utils/discord', () => ({
  notifyMatchResult: vi.fn(async () => undefined),
  notifyBracketUpdate: vi.fn(async () => undefined),
  notifyCheckinForfeit: h.notifyCheckinForfeit,
  notifyCheckinReminder: vi.fn(async () => undefined),
  notifyCheckinOpened: vi.fn(async () => undefined),
  notifyCheckinCancelledNoShow: vi.fn(async () => undefined),
  notifyLineupReminder: vi.fn(async () => undefined),
}));
vi.mock('../../utils/email', () => ({
  sendMatchCheckinEmail: vi.fn(async () => ({ ok: true })),
  sendCheckinReminderEmail: vi.fn(async () => ({ ok: true })),
  sendCheckinForfeitEmail: h.sendCheckinForfeitEmail,
  sendCheckinCancelledEmail: vi.fn(async () => ({ ok: true })),
}));

import {
  resetSupabaseMock,
  setTableWriteError,
  store,
} from './__helpers__/supabaseMock';
import { applyMatchScore } from '../../utils/matches/applyScore';
import {
  createForfeitProposal,
  isForfeitProposalSchemaMissing,
  loadForfeitProposalRecipients,
  overridePendingForfeitProposal,
} from '../../utils/matches/forfeitProposal';
import { resolveForfeitProposal } from '../../utils/matches/forfeitProposalResolve';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '7d1b9a52-3f6e-4c1a-9d2b-0a1b2c3d4e5f';
const STAFF = 'staff-1';

function seedMatch(over: Record<string, unknown> = {}) {
  store.matches = [
    {
      id: 'm1',
      tenant_id: TENANT,
      tournament_id: 'tour-1',
      stage_id: null,
      status: 'pending',
      is_bye: false,
      match_format: 'bo3',
      scheduled_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      team1_id: 'team-a',
      team2_id: 'team-b',
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      forfeit_team_id: null,
      completed_at: null,
      updated_at: '2026-10-07T18:00:00.000Z',
      team1_checked_in_at: '2026-10-07T17:30:00.000Z',
      team2_checked_in_at: null,
      forfeit_processed_at: '2026-10-07T18:01:00.000Z',
      forfeit_proposed_team_id: 'team-b',
      forfeit_proposed_at: '2026-10-07T18:01:00.000Z',
      forfeit_proposal_status: 'pending',
      forfeit_proposal_resolved_by: null,
      forfeit_proposal_resolved_at: null,
      ...over,
    },
  ] as any;
  store.teams = [
    { id: 'team-a', tenant_id: TENANT, name: 'Alpha' },
    { id: 'team-b', tenant_id: TENANT, name: 'Bravo' },
  ] as any;
  store.tournaments = [
    { id: 'tour-1', tenant_id: TENANT, name: 'Cup', status: 'running' },
  ] as any;
}

const row = () => store.matches[0] as any;
const resolvedEvents = () =>
  ((store.bot_event_outbox ?? []) as any[]).filter(
    (e) => e.event_name === 'match.forfeit_resolved'
  );

beforeEach(() => {
  resetSupabaseMock();
  h.notifyCheckinForfeit.mockClear();
  h.sendCheckinForfeitEmail.mockClear();
});

describe('resolveForfeitProposal — confirmer', () => {
  it('applique le forfait comme le cron le faisait (requiredWins-0, walkover)', async () => {
    seedMatch();
    const r = await resolveForfeitProposal({
      tenantId: TENANT,
      matchId: 'm1',
      decision: 'confirm',
      staffId: STAFF,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome).toBe('confirmed');
    expect(r.proposal.status).toBe('confirmed');
    expect(r.match).toMatchObject({
      status: 'walkover',
      team1Score: 2,
      team2Score: 0,
      winnerTeamId: 'team-a',
    });

    expect(row()).toMatchObject({
      status: 'walkover',
      team1_score: 2,
      team2_score: 0,
      winner_team_id: 'team-a',
      forfeit_team_id: 'team-b',
      no_show_reason: 'auto_forfeit_no_checkin',
      forfeit_proposal_status: 'confirmed',
      forfeit_proposal_resolved_by: STAFF,
    });
    expect(row().forfeit_proposal_resolved_at).toBeTruthy();
    // Les messages du forfait partent à la confirmation, plus avant.
    expect(h.notifyCheckinForfeit).toHaveBeenCalledOnce();
    expect(resolvedEvents()).toHaveLength(1);
    expect(resolvedEvents()[0].payload.data).toMatchObject({
      matchId: 'm1',
      outcome: 'confirmed',
      by: { staffId: STAFF },
    });
  });

  it('un échec du forfait remet la proposition en attente (APPLY_FAILED)', async () => {
    seedMatch();
    store.tournaments = [
      { id: 'tour-1', tenant_id: TENANT, status: 'completed' },
    ] as any;
    const r = await resolveForfeitProposal({
      tenantId: TENANT,
      matchId: 'm1',
      decision: 'confirm',
      staffId: STAFF,
    });
    expect(r).toMatchObject({ ok: false, code: 'APPLY_FAILED' });
    expect(row().forfeit_proposal_status).toBe('pending');
    expect(row().status).toBe('pending');
    expect(resolvedEvents()).toHaveLength(0);
  });

  it('sur un match déjà clos (score des équipes), la proposition est caduque : NOT_PENDING', async () => {
    seedMatch({
      status: 'finished',
      team1_score: 1,
      team2_score: 2,
      winner_team_id: 'team-b',
    });
    const r = await resolveForfeitProposal({
      tenantId: TENANT,
      matchId: 'm1',
      decision: 'confirm',
      staffId: STAFF,
    });
    expect(r).toMatchObject({
      ok: false,
      code: 'FORFEIT_PROPOSAL_NOT_PENDING',
      matchStatus: 'finished',
    });
    if (r.ok) return;
    expect(r.proposal?.status).toBe('overridden');
    // Le résultat joué n'est pas écrasé.
    expect(row()).toMatchObject({
      status: 'finished',
      team1_score: 1,
      team2_score: 2,
      winner_team_id: 'team-b',
    });
    expect(resolvedEvents()[0].payload.data.outcome).toBe('overridden');
  });
});

describe('resolveForfeitProposal — refuser, 409, absence', () => {
  it('refuser ne touche à rien sur le match', async () => {
    seedMatch();
    const r = await resolveForfeitProposal({
      tenantId: TENANT,
      matchId: 'm1',
      decision: 'decline',
      staffId: STAFF,
    });
    expect(r).toMatchObject({ ok: true, outcome: 'declined', match: null });
    expect(row()).toMatchObject({
      status: 'pending',
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      forfeit_team_id: null,
      forfeit_proposal_status: 'declined',
      forfeit_proposal_resolved_by: STAFF,
    });
    expect(h.notifyCheckinForfeit).not.toHaveBeenCalled();
    expect(resolvedEvents()[0].payload.data.outcome).toBe('declined');
  });

  it('une proposition déjà tranchée répond NOT_PENDING avec son état', async () => {
    seedMatch({ forfeit_proposal_status: 'declined' });
    for (const decision of ['confirm', 'decline'] as const) {
      const r = await resolveForfeitProposal({
        tenantId: TENANT,
        matchId: 'm1',
        decision,
        staffId: STAFF,
      });
      expect(r).toMatchObject({
        ok: false,
        code: 'FORFEIT_PROPOSAL_NOT_PENDING',
        proposal: { status: 'declined', absentTeamId: 'team-b' },
      });
    }
    expect(row().status).toBe('pending');
    expect(resolvedEvents()).toHaveLength(0);
  });

  it('sans proposition : FORFEIT_PROPOSAL_NOT_FOUND ; match inconnu : MATCH_NOT_FOUND', async () => {
    seedMatch({
      forfeit_proposal_status: null,
      forfeit_proposed_team_id: null,
    });
    expect(
      await resolveForfeitProposal({
        tenantId: TENANT,
        matchId: 'm1',
        decision: 'confirm',
        staffId: STAFF,
      })
    ).toMatchObject({ ok: false, code: 'FORFEIT_PROPOSAL_NOT_FOUND' });
    expect(
      await resolveForfeitProposal({
        tenantId: OTHER_TENANT,
        matchId: 'inconnu',
        decision: 'confirm',
        staffId: STAFF,
      })
    ).toMatchObject({ ok: false, code: 'MATCH_NOT_FOUND' });
  });
});

describe('création — idempotence et migration absente', () => {
  it('ne pose la proposition qu’une fois', async () => {
    seedMatch({
      forfeit_proposal_status: null,
      forfeit_proposed_team_id: null,
      forfeit_proposed_at: null,
    });
    const first = await createForfeitProposal({
      tenantId: TENANT,
      matchId: 'm1',
      absentTeamId: 'team-b',
    });
    expect(first.outcome).toBe('created');
    if (first.outcome === 'created') {
      expect(first.proposal).toMatchObject({
        status: 'pending',
        absentTeamId: 'team-b',
        proposedWinnerTeamId: 'team-a',
      });
    }
    const second = await createForfeitProposal({
      tenantId: TENANT,
      matchId: 'm1',
      absentTeamId: 'team-a',
    });
    expect(second.outcome).toBe('exists');
    expect(row().forfeit_proposed_team_id).toBe('team-b');
    expect(row().status).toBe('pending');
  });

  it('colonnes absentes : `unavailable`, rien d’écrit', async () => {
    seedMatch({ forfeit_proposal_status: null });
    setTableWriteError('matches', {
      code: 'PGRST204',
      message: "Could not find the 'forfeit_proposed_at' column",
    } as any);
    const r = await createForfeitProposal({
      tenantId: TENANT,
      matchId: 'm1',
      absentTeamId: 'team-b',
    });
    setTableWriteError('matches', null);
    expect(r.outcome).toBe('unavailable');
    expect(
      isForfeitProposalSchemaMissing({
        code: '42703',
        message: 'column matches.forfeit_proposal_status does not exist',
      })
    ).toBe(true);
    expect(isForfeitProposalSchemaMissing({ code: '23505' })).toBe(false);
  });
});

describe('écrasement par une saisie de score', () => {
  it('une saisie STAFF passe la proposition en `overridden`', async () => {
    seedMatch();
    await applyMatchScore({
      tenantId: TENANT,
      matchId: 'm1',
      team1Score: 1,
      team2Score: 2,
      staffId: STAFF,
      propagateBracket: false,
    });
    expect(row().status).toBe('finished');
    expect(row().forfeit_proposal_status).toBe('overridden');
    expect(row().forfeit_proposal_resolved_by).toBe(STAFF);
    expect(resolvedEvents()).toHaveLength(1);
    expect(resolvedEvents()[0].payload.data).toMatchObject({
      outcome: 'overridden',
      by: { staffId: STAFF },
    });
  });

  it('un report de capitaine (staffId nul) ne l’écrase pas', async () => {
    seedMatch();
    await applyMatchScore({
      tenantId: TENANT,
      matchId: 'm1',
      team1Score: 2,
      team2Score: 0,
      staffId: null,
      propagateBracket: false,
    });
    expect(row().status).toBe('finished');
    expect(row().forfeit_proposal_status).toBe('pending');
    expect(resolvedEvents()).toHaveLength(0);
  });

  it('sans proposition en attente : rien à écraser, aucun événement', async () => {
    seedMatch({ forfeit_proposal_status: 'declined' });
    const changed = await overridePendingForfeitProposal({
      tenantId: TENANT,
      matchId: 'm1',
      staffId: STAFF,
    });
    expect(changed).toBe(false);
    expect(row().forfeit_proposal_status).toBe('declined');
    expect(resolvedEvents()).toHaveLength(0);
  });
});

describe('destinataires du DM', () => {
  it('admins/owners EFFECTIFS du tenant, actifs, au compte Discord lié', async () => {
    store.tenant_staff = [
      // Admin global rattaché au tenant.
      { tenant_id: TENANT, staff_id: 's-admin', role: 'admin' },
      // Caster global ÉLEVÉ owner par le tenant.
      { tenant_id: TENANT, staff_id: 's-elevated', role: 'owner' },
      // Arbitre : ne tranche pas un forfait par DM.
      { tenant_id: TENANT, staff_id: 's-referee', role: 'referee' },
      // Admin inactif.
      { tenant_id: TENANT, staff_id: 's-inactive', role: 'admin' },
      // Admin sans compte Discord lié.
      { tenant_id: TENANT, staff_id: 's-unlinked', role: 'admin' },
      // Admin d'un AUTRE tenant.
      { tenant_id: OTHER_TENANT, staff_id: 's-other', role: 'admin' },
    ] as any;
    store.staff = [
      { id: 's-admin', auth_user_id: 'u-admin', role: 'admin' },
      { id: 's-elevated', auth_user_id: 'u-elevated', role: 'caster' },
      { id: 's-referee', auth_user_id: 'u-referee', role: 'referee' },
      {
        id: 's-inactive',
        auth_user_id: 'u-inactive',
        role: 'admin',
        is_active: false,
      },
      { id: 's-unlinked', auth_user_id: 'u-unlinked', role: 'admin' },
      { id: 's-other', auth_user_id: 'u-other', role: 'admin' },
    ] as any;
    store.user_discord_links = [
      { auth_user_id: 'u-admin', discord_user_id: '900000000000000001' },
      { auth_user_id: 'u-elevated', discord_user_id: '900000000000000002' },
      { auth_user_id: 'u-referee', discord_user_id: '900000000000000003' },
      { auth_user_id: 'u-inactive', discord_user_id: '900000000000000004' },
      { auth_user_id: 'u-other', discord_user_id: '900000000000000005' },
    ] as any;

    const recipients = await loadForfeitProposalRecipients(TENANT);
    expect(recipients.map((r) => r.discordUserId).sort()).toEqual([
      '900000000000000001',
      '900000000000000002',
    ]);
    expect(recipients.find((r) => r.userId === 'u-admin')).toBeTruthy();
  });
});
