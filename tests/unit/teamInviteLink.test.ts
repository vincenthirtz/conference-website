// Unit tests — invitation par email + « lien privé » (capitaine ↔ manager).
//
//   POST /api/teams/invitations           → crée l'invitation + le lien privé
//   GET/POST /api/teams/invitations/by-token → consulte / accepte le lien
//
// Règles métier couvertes :
//   - une CAPITAINE peut confier un rôle de gestion (manager) ;
//   - un MANAGER ne le peut PAS (anti-escalade, 403 ROLE_ESCALATION) ;
//   - un MANAGER peut désigner la CAPITAINE (`set_captain`) tant que l'équipe
//     n'en a pas ; sinon 409 CAPTAIN_ALREADY_SET (c'est un transfert, réservé
//     à la capitaine en poste) ;
//   - le jeton n'est jamais stocké en clair : seul son SHA-256 est en base ;
//   - le lien n'authentifie pas : POST sans session → 401, avec la session de
//     quelqu'un d'autre → 403.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendTeamInviteLinkEmail } = vi.hoisted(() => ({
  sendTeamInviteLinkEmail: vi.fn(async () => ({ success: true as const })),
}));
vi.mock('@/utils/email', () => ({
  sendTeamInviteLinkEmail,
  sendWelcomeEmail: vi.fn(async () => ({ success: true as const })),
}));

vi.mock('@/utils/teams/rosterLock', () => ({
  isTeamRosterLocked: vi.fn(async () => ({ locked: false })),
  rosterLockErrorMessage: () => 'Roster verrouillé',
}));

const emitRoleSyncEvent = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/utils/botRoleSync', () => ({
  emitRoleSyncEvent: (...args: unknown[]) => emitRoleSyncEvent(...args),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
  setRpcResult,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import { hashInviteToken } from '../../utils/teams/inviteLinks';
import createInviteHandler from '../../pages/api/teams/invitations/index';
import byTokenHandler from '../../pages/api/teams/invitations/by-token';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MANAGER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const INVITEE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const INVITEE_EMAIL = 'invitee@example.com';

let _tok = 0;
function freshToken() {
  _tok += 1;
  return `t-${Date.now()}-${_tok}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** Équipe avec une capitaine + un manager. `captainId: null` = sans capitaine. */
function seedTeam(captainId: string | null = CAPTAIN_ID) {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      captain_id: captainId,
      tenant_id: CONFERENCE_TENANT_ID,
    },
  ];
  store.team_members = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      role: 'player',
      tenant_id: CONFERENCE_TENANT_ID,
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      team_id: TEAM_ID,
      user_id: MANAGER_ID,
      role: 'manager',
      tenant_id: CONFERENCE_TENANT_ID,
    },
  ];
  store.demandes = [];
  store.staff = [];
}

beforeEach(() => {
  resetSupabaseMock();
  sendTeamInviteLinkEmail.mockClear();
  emitRoleSyncEvent.mockClear();
  setAuthListUsers([{ id: INVITEE_ID, email: INVITEE_EMAIL }]);
  seedTeam();
});

describe('POST /api/teams/invitations', () => {
  it('la capitaine invite un manager : invitation pending + lien privé', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await createInviteHandler(
      makeReq({ body: { email: INVITEE_EMAIL, role: 'manager' } }),
      res
    );

    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.invitation.role).toBe('manager');
    expect(body.invite_url).toMatch(/\/invitation\//);

    // Personne n'est ajouté d'office : une invitation pending, c'est tout.
    const invites = (store.demandes as any[]).filter(
      (d) => d.type === 'invite'
    );
    expect(invites).toHaveLength(1);
    expect(invites[0].status).toBe('pending');
    expect(invites[0].user_id).toBe(INVITEE_ID);
    expect(invites[0].payload.desired_role).toBe('manager');
    expect(invites[0].payload.captain_auth_user_id).toBe(CAPTAIN_ID);
    expect(store.team_members as any[]).toHaveLength(2);

    // Le jeton n'est stocké QUE hashé.
    const token = body.invite_url.split('/invitation/')[1];
    expect(invites[0].payload.invite_token_hash).toBe(hashInviteToken(token));
    expect(JSON.stringify(invites[0].payload)).not.toContain(token);

    expect(sendTeamInviteLinkEmail).toHaveBeenCalledTimes(1);
    expect(body.email_sent).toBe(true);
  });

  it('403 quand un manager tente de confier un rôle de gestion (anti-escalade)', async () => {
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();

    await createInviteHandler(
      makeReq({ body: { email: INVITEE_EMAIL, role: 'manager' } }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('ROLE_ESCALATION');
    expect((store.demandes as any[]) ?? []).toHaveLength(0);
  });

  it('un manager désigne la capitaine quand l’équipe n’en a pas', async () => {
    seedTeam(null);
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();

    await createInviteHandler(
      makeReq({
        body: { email: INVITEE_EMAIL, role: 'player', set_captain: true },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const invites = (store.demandes as any[]).filter(
      (d) => d.type === 'invite'
    );
    expect(invites[0].payload.set_captain).toBe(true);
    // Le capitanat n'est attribué qu'à l'acceptation.
    expect((store.teams as any)[0].captain_id ?? null).toBeNull();
  });

  it('409 quand on tente de désigner une capitaine alors qu’il y en a déjà une', async () => {
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();

    await createInviteHandler(
      makeReq({
        body: { email: INVITEE_EMAIL, role: 'player', set_captain: true },
      }),
      res
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('CAPTAIN_ALREADY_SET');
  });

  it('403 quand l’appelant ne gère aucune équipe', async () => {
    setAuthUser({ id: INVITEE_ID });
    const res = makeRes();

    await createInviteHandler(
      makeReq({ body: { email: 'someone@example.com', role: 'player' } }),
      res
    );

    expect(res.statusCode).toBe(403);
  });

  it('400 sur un email invalide', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await createInviteHandler(
      makeReq({ body: { email: 'pas-un-email', role: 'player' } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
  });
});

describe('GET/POST /api/teams/invitations/by-token', () => {
  /** Crée une invitation via l'API et renvoie son jeton en clair. */
  async function createInvite(over: Record<string, unknown> = {}) {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await createInviteHandler(
      makeReq({ body: { email: INVITEE_EMAIL, role: 'manager', ...over } }),
      res
    );
    expect(res.statusCode).toBe(201);
    const url = (res.body as any).invite_url as string;
    return url.split('/invitation/')[1];
  }

  it('GET expose les métadonnées publiques, sans email en clair', async () => {
    const token = await createInvite();
    const res = makeRes();

    await byTokenHandler(makeReq({ method: 'GET', query: { token } }), res);

    expect(res.statusCode).toBe(200);
    const inv = (res.body as any).invitation;
    expect(inv.team_name).toBe('Alpha');
    expect(inv.role).toBe('manager');
    expect(inv.as_captain).toBe(false);
    // Email masqué (jamais l'adresse complète sur une route publique).
    expect(inv.invited_email).toBe('i***@example.com');
    expect(JSON.stringify(res.body)).not.toContain(INVITEE_EMAIL);
  });

  it('GET 404 sur un jeton inconnu ou mal formé', async () => {
    const resUnknown = makeRes();
    await byTokenHandler(
      makeReq({ method: 'GET', query: { token: 'a'.repeat(43) } }),
      resUnknown
    );
    expect(resUnknown.statusCode).toBe(404);

    const resMalformed = makeRes();
    await byTokenHandler(
      makeReq({ method: 'GET', query: { token: 'court' } }),
      resMalformed
    );
    expect(resMalformed.statusCode).toBe(404);
  });

  it('POST sans session → 401 (le lien n’authentifie pas)', async () => {
    const token = await createInvite();
    const res = makeRes();

    await byTokenHandler(
      {
        method: 'POST',
        headers: { host: 'h' },
        query: {},
        body: { token, action: 'accept' },
      } as any,
      res
    );

    expect(res.statusCode).toBe(401);
  });

  it('POST avec la session de quelqu’un d’autre → 403', async () => {
    const token = await createInvite();
    setAuthUser({ id: MANAGER_ID, email: 'manager@example.com' });
    const res = makeRes();

    await byTokenHandler(
      makeReq({ method: 'POST', body: { token, action: 'accept' } }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('NOT_INVITEE');
  });

  it('POST accept par l’invitée : la RPC d’acceptation est appelée', async () => {
    const token = await createInvite();
    setRpcResult('accept_invitation', {
      data: { id: 'tm-new', team_id: TEAM_ID, user_id: INVITEE_ID },
      error: null,
    });
    setAuthUser({ id: INVITEE_ID, email: INVITEE_EMAIL });
    const res = makeRes();

    await byTokenHandler(
      makeReq({ method: 'POST', body: { token, action: 'accept' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).action).toBe('accept');
    expect((res.body as any).teamId).toBe(TEAM_ID);
  });

  it('POST reject par l’invitée : la demande passe rejected', async () => {
    const token = await createInvite();
    setAuthUser({ id: INVITEE_ID, email: INVITEE_EMAIL });
    const res = makeRes();

    await byTokenHandler(
      makeReq({ method: 'POST', body: { token, action: 'reject' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const invite = (store.demandes as any[]).find((d) => d.type === 'invite');
    expect(invite.status).toBe('rejected');
  });

  it('un jeton déjà utilisé devient inerte (409)', async () => {
    const token = await createInvite();
    setAuthUser({ id: INVITEE_ID, email: INVITEE_EMAIL });
    const first = makeRes();
    await byTokenHandler(
      makeReq({ method: 'POST', body: { token, action: 'reject' } }),
      first
    );
    expect(first.statusCode).toBe(200);

    const second = makeRes();
    await byTokenHandler(makeReq({ method: 'GET', query: { token } }), second);
    expect(second.statusCode).toBe(409);
  });
});
