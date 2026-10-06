// tests/unit/joinRequestDecision.test.ts
//
// Décisions sur les demandes d'adhésion / de transfert (lot P1 joueuse).
//
// Ce que ce fichier verrouille :
//   1. un refus n'écrit plus « Traite par le capitaine (<uuid>) » dans
//      `staff_note` — affiché à la joueuse comme « Motif : … » — mais le motif
//      FACULTATIF saisi par la capitaine (ou rien), borné par zod ;
//   2. la candidate est prévenue (`team.join.decided`), sauf si elle a coupé
//      ce type dans ses préférences ;
//   3. l'actu automatique naît en BROUILLON aussi pour un transfert, avec un
//      rôle lisible et des accents.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { emitBotEvent } = vi.hoisted(() => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));
vi.mock('@/utils/botEvents', () => ({ emitBotEvent }));

const { getDiscordLinksForUsers } = vi.hoisted(() => ({
  getDiscordLinksForUsers: vi.fn(async (userIds: string[]) => {
    const map = new Map<
      string,
      { discordUserId: string; discordUsername: string }
    >();
    for (const id of userIds) {
      if (id === 'new-player') {
        map.set(id, { discordUserId: '42', discordUsername: 'camille' });
      }
    }
    return map;
  }),
}));
vi.mock('@/utils/discordLinks', () => ({ getDiscordLinksForUsers }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
} from './__helpers__/supabaseMock';

import joinRequestsHandler from '../../pages/api/teams/join-requests';
import transferRequestsHandler from '../../pages/api/teams/transfer-requests';
import { JoinRequestDecisionBody } from '../../features/player/team/schemas';
import { buildJoinNewsText } from '../../utils/teams/joinDecisionNews';
import {
  PLAYER_PUSH_EVENT_TYPES,
  WEB_PUSH_EVENT_TYPES,
  playerUrlForEvent,
  renderWebPushPayload,
} from '../../utils/webPushEvents';
import { BOT_EVENT_NAMES } from '../../utils/botEventNames';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const DEMANDE = '550e8400-e29b-41d4-a716-446655440000';
const CAPTAIN = 'captain-1';

let _tok = 0;
function makeReq(body: Record<string, unknown>): any {
  _tok += 1;
  return {
    method: 'POST',
    headers: {
      host: 'h',
      authorization: `Bearer jr-decision-${Date.now()}-${_tok}`,
    },
    query: {},
    body,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function decidedEvents() {
  return emitBotEvent.mock.calls.filter(
    (c: unknown[]) => c[0] === 'team.join.decided'
  ) as unknown as Array<[string, Record<string, unknown>, string]>;
}

function seed(type: 'join' | 'transfer') {
  resetSupabaseMock();
  emitBotEvent.mockClear();
  setAuthUser({ id: CAPTAIN });
  store.teams = [
    {
      id: 'team-1',
      tenant_id: TENANT,
      captain_id: CAPTAIN,
      is_active: true,
      name: 'Alpha',
      logo_url: null,
    },
  ] as any;
  store.team_members = [];
  store.tournament_teams = [];
  store.notification_prefs = [];
  store.demandes = [
    {
      id: DEMANDE,
      team_id: 'team-1',
      tenant_id: TENANT,
      type,
      status: 'pending',
      user_id: 'new-player',
      staff_note: null,
      payload: {
        desired_role: 'player',
        user_battle_tag: 'Camille#1234',
        ...(type === 'transfer' ? { from_team_name: 'Bêta' } : {}),
      },
    },
  ] as any;
  store.news = [];
  setRpcResult(
    type === 'join' ? 'approve_join_request' : 'approve_transfer_request',
    {
      data: { id: 'tm-new', team_id: 'team-1', user_id: 'new-player' },
      error: null,
    }
  );
}

describe('refus — motif de la capitaine', () => {
  beforeEach(() => seed('join'));

  it('écrit le motif saisi, jamais un uuid', async () => {
    const res = makeRes();
    await joinRequestsHandler(
      makeReq({
        demandeId: DEMANDE,
        action: 'reject',
        reason: '  Roster complet pour cette saison.  ',
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.demandes as any[])[0];
    expect(row.status).toBe('rejected');
    expect(row.staff_note).toBe('Roster complet pour cette saison.');
    expect(String(row.staff_note)).not.toContain(CAPTAIN);
    // L'auteur reste tracé, hors de vue de la joueuse.
    expect(row.payload.rejected_by_user_id).toBe(CAPTAIN);
    expect(row.payload.desired_role).toBe('player');
  });

  it('sans motif : aucune note (plus de « Traite par le capitaine »)', async () => {
    const res = makeRes();
    await joinRequestsHandler(
      makeReq({ demandeId: DEMANDE, action: 'reject' }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.demandes as any[])[0].staff_note).toBeNull();
  });

  it('refuse un motif trop long (400)', async () => {
    const res = makeRes();
    await joinRequestsHandler(
      makeReq({
        demandeId: DEMANDE,
        action: 'reject',
        reason: 'x'.repeat(301),
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((store.demandes as any[])[0].status).toBe('pending');
  });

  it('schéma : motif facultatif, borné à 300, rogné', () => {
    expect(
      JoinRequestDecisionBody.safeParse({
        demandeId: DEMANDE,
        action: 'reject',
      }).success
    ).toBe(true);
    const ok = JoinRequestDecisionBody.safeParse({
      demandeId: DEMANDE,
      action: 'reject',
      reason: '  ok  ',
    });
    expect(ok.success && ok.data.reason).toBe('ok');
    expect(
      JoinRequestDecisionBody.safeParse({
        demandeId: DEMANDE,
        action: 'reject',
        reason: 'x'.repeat(301),
      }).success
    ).toBe(false);
    expect(
      JoinRequestDecisionBody.safeParse({
        demandeId: DEMANDE,
        action: 'reject',
        reason: 12,
      }).success
    ).toBe(false);
  });
});

describe('team.join.decided — la candidate est prévenue', () => {
  it('refus : un event, avec le motif, à la seule candidate', async () => {
    seed('join');
    await joinRequestsHandler(
      makeReq({ demandeId: DEMANDE, action: 'reject', reason: 'Complet.' }),
      makeRes()
    );
    const events = decidedEvents();
    expect(events).toHaveLength(1);
    const [, data, tenant] = events[0];
    expect(tenant).toBe(TENANT);
    expect(data).toMatchObject({
      userId: 'new-player',
      discordUserId: '42',
      demandeId: DEMANDE,
      kind: 'join',
      decision: 'rejected',
      teamId: 'team-1',
      teamName: 'Alpha',
      role: null,
      reason: 'Complet.',
    });
    expect(String(data.ctaUrl)).toMatch(/\/player$/);
  });

  it('acceptation : decision approved + rôle accordé, pas de motif', async () => {
    seed('join');
    const res = makeRes();
    await joinRequestsHandler(
      makeReq({ demandeId: DEMANDE, action: 'approve', reason: 'ignoré' }),
      res
    );
    expect(res.statusCode).toBe(200);
    const events = decidedEvents();
    expect(events).toHaveLength(1);
    expect(events[0][1]).toMatchObject({
      decision: 'approved',
      kind: 'join',
      role: 'player',
      reason: null,
    });
  });

  it('transfert accepté : kind transfer', async () => {
    seed('transfer');
    await transferRequestsHandler(
      makeReq({ demandeId: DEMANDE, action: 'approve' }),
      makeRes()
    );
    const events = decidedEvents();
    expect(events).toHaveLength(1);
    expect(events[0][1]).toMatchObject({
      kind: 'transfer',
      decision: 'approved',
    });
  });

  it("n'émet rien quand la joueuse a coupé ce type (opt-out push)", async () => {
    seed('join');
    store.notification_prefs = [
      {
        user_id: 'new-player',
        event_type: 'team.join.decided',
        channel: 'push',
        enabled: false,
      },
    ] as any;
    const res = makeRes();
    await joinRequestsHandler(
      makeReq({ demandeId: DEMANDE, action: 'reject' }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(decidedEvents()).toHaveLength(0);
  });

  it('une annonce qui échoue ne casse pas la décision', async () => {
    seed('join');
    emitBotEvent.mockRejectedValueOnce(new Error('outbox down'));
    const res = makeRes();
    await joinRequestsHandler(
      makeReq({ demandeId: DEMANDE, action: 'reject' }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.demandes as any[])[0].status).toBe('rejected');
  });
});

describe('actu automatique', () => {
  it('transfert : BROUILLON, rôle lisible, accents', async () => {
    seed('transfer');
    const res = makeRes();
    await transferRequestsHandler(
      makeReq({ demandeId: DEMANDE, action: 'approve' }),
      res
    );
    expect(res.statusCode).toBe(200);
    const news = store.news as any[];
    expect(news).toHaveLength(1);
    expect(news[0].status).toBe('draft');
    expect(news[0].published_at).toBeNull();
    expect(news[0].title).toBe('Camille est transférée vers Alpha');
    expect(news[0].content).toBe(
      'Camille a été transférée de Bêta vers Alpha en tant que joueuse. Bienvenue !'
    );
  });

  it('adhésion : rôle lisible, pas la valeur brute', async () => {
    seed('join');
    await joinRequestsHandler(
      makeReq({ demandeId: DEMANDE, action: 'approve' }),
      makeRes()
    );
    const news = (store.news as any[])[0];
    expect(news.status).toBe('draft');
    expect(news.excerpt).toBe('Camille rejoint Alpha en tant que joueuse.');
    expect(news.excerpt).not.toContain('player');
  });

  it('buildJoinNewsText : libellés de rôle et équipe d’origine inconnue', () => {
    expect(
      buildJoinNewsText({
        kind: 'join',
        playerName: 'Lou',
        teamName: 'Alpha',
        role: 'substitute',
      }).excerpt
    ).toBe('Lou rejoint Alpha en tant que remplaçante.');
    const t = buildJoinNewsText({
      kind: 'transfer',
      playerName: 'Lou',
      teamName: 'Alpha',
      role: 'coach',
      fromTeamName: null,
    });
    expect(t.excerpt).toBe(
      'Lou quitte une autre équipe et rejoint Alpha en tant que coach.'
    );
  });
});

describe('catalogues et rendu push', () => {
  it('team.join.decided est un event bot, push, et réglable par la joueuse', () => {
    expect(BOT_EVENT_NAMES).toContain('team.join.decided');
    expect(WEB_PUSH_EVENT_TYPES).toContain('team.join.decided');
    expect(PLAYER_PUSH_EVENT_TYPES).toContain('team.join.decided');
  });

  it('pointe le tableau de bord joueuse', () => {
    expect(playerUrlForEvent('team.join.decided', {})).toBe('/player');
  });

  it('acceptation : nomme l’équipe', () => {
    const r = renderWebPushPayload('team.join.decided', {
      data: { decision: 'approved', kind: 'join', teamName: 'Alpha' },
    });
    expect(r.title).toBe('Candidature acceptée');
    expect(r.body).toContain('Alpha');
  });

  it('refus : le motif n’est PAS dans la notification', () => {
    const r = renderWebPushPayload('team.join.decided', {
      data: {
        decision: 'rejected',
        kind: 'transfer',
        teamName: 'Alpha',
        reason: 'Motif très personnel',
      },
    });
    expect(r.title).toBe('Transfert refusé');
    expect(r.body).not.toContain('Motif très personnel');
    expect(r.body).toContain('Le motif est dans ton espace.');
  });
});
