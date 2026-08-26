// Unit tests — invitations SORTANTES vues depuis l'espace équipe.
//
//   GET    /api/teams/invitations                  → liste les pending
//   POST   /api/teams/invitations/[invitationId]   → relance (nouveau lien)
//   DELETE /api/teams/invitations/[invitationId]   → annule
//
// Contexte de la régression que ces tests verrouillent : l'inscription web crée
// une invitation par joueuse saisie (invite-accept model). Aucune route ne
// permettait de les LIRE côté équipe — l'espace n'affichait que le roster (les
// personnes ayant accepté) et les demandes ENTRANTES. Une capitaine qui venait
// d'inscrire six joueuses voyait « 1 membre » + « aucune demande en attente »,
// ce qui se lit comme une saisie perdue.
//
// Règles couvertes :
//   - la liste est scopée à l'équipe gérée, et ne renvoie que les `pending` ;
//   - le jeton en clair n'y apparaît JAMAIS (seul `has_invite_link` sort) ;
//   - une invitation expirée reste listée, marquée `expired` (c'est elle qu'on
//     veut relancer) — contrairement à la vue côté invitée qui les masque ;
//   - relancer remplace le hash du lien (l'ancien lien meurt) et repousse
//     l'expiration ;
//   - un manager peut agir sur une invitation émise par la capitaine (l'équipe
//     se gère à plusieurs) ;
//   - une invitation d'une AUTRE équipe est un 404, pas un 403 : son existence
//     ne doit pas fuir.

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

vi.mock('@/utils/botRoleSync', () => ({
  emitRoleSyncEvent: vi.fn(() => Promise.resolve()),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import { hashInviteToken } from '../../utils/teams/inviteLinks';
import listHandler from '../../pages/api/teams/invitations/index';
import invitationHandler from '../../pages/api/teams/invitations/[invitationId]';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TEAM_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MANAGER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const INVITEE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const INVITE_ID = '99999999-9999-9999-9999-999999999999';
const OTHER_INVITE_ID = '88888888-8888-8888-8888-888888888888';

let _tok = 0;
function freshToken() {
  _tok += 1;
  return `t-${_tok}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
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

const inDays = (days: number) =>
  new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();

function seedTeam() {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      captain_id: CAPTAIN_ID,
      tenant_id: CONFERENCE_TENANT_ID,
    },
    {
      id: OTHER_TEAM_ID,
      name: 'Beta',
      captain_id: null,
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
  store.staff = [];
}

/** Une invitation pending émise par la capitaine. */
function seedInvitation(over: Record<string, unknown> = {}) {
  const row = {
    id: INVITE_ID,
    type: 'invite',
    status: 'pending',
    team_id: TEAM_ID,
    user_id: INVITEE_ID,
    source: 'website',
    tenant_id: CONFERENCE_TENANT_ID,
    created_at: new Date().toISOString(),
    processed_at: null,
    comment: null,
    payload: {
      desired_role: 'player',
      battle_tag: 'Noémiedepain#1234',
      specialty: 'dps',
      expires_at: inDays(7),
      invite_email: 'invitee@example.com',
      invite_token_hash: hashInviteToken('old-token'),
      captain_auth_user_id: CAPTAIN_ID,
    },
    ...over,
  };
  store.demandes = [...((store.demandes as any[]) ?? []), row];
  return row;
}

beforeEach(() => {
  resetSupabaseMock();
  sendTeamInviteLinkEmail.mockClear();
  setAuthListUsers([{ id: INVITEE_ID, email: 'invitee@example.com' }]);
  seedTeam();
  store.demandes = [];
});

describe('GET /api/teams/invitations', () => {
  it('liste les invitations en attente de l’équipe gérée', async () => {
    seedInvitation();
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await listHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const invitations = (res.body as any).invitations;
    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({
      id: INVITE_ID,
      email: 'invitee@example.com',
      role: 'player',
      battle_tag: 'Noémiedepain#1234',
      specialty: 'dps',
      expired: false,
      has_invite_link: true,
    });
  });

  it('ne fait JAMAIS sortir le hash ni le jeton du lien privé', async () => {
    seedInvitation();
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await listHandler(makeReq(), res);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(hashInviteToken('old-token'));
    expect(serialized).not.toContain('old-token');
    expect(serialized).toContain('has_invite_link');
  });

  it('garde les invitations EXPIRÉES, marquées comme telles', async () => {
    // Côté invitée elles sont masquées ; côté équipe elles sont l'information
    // utile — c'est précisément celles-là qu'il faut relancer.
    seedInvitation({
      payload: {
        desired_role: 'player',
        expires_at: inDays(-1),
        invite_email: 'late@example.com',
        captain_auth_user_id: CAPTAIN_ID,
      },
    });
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await listHandler(makeReq(), res);

    const invitations = (res.body as any).invitations;
    expect(invitations).toHaveLength(1);
    expect(invitations[0].expired).toBe(true);
    expect(invitations[0].has_invite_link).toBe(false);
  });

  it('ignore les invitations déjà traitées et celles des autres équipes', async () => {
    seedInvitation();
    seedInvitation({ id: OTHER_INVITE_ID, status: 'approved' });
    seedInvitation({
      id: '77777777-7777-7777-7777-777777777777',
      team_id: OTHER_TEAM_ID,
    });
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await listHandler(makeReq(), res);

    const invitations = (res.body as any).invitations;
    expect(invitations).toHaveLength(1);
    expect(invitations[0].id).toBe(INVITE_ID);
  });

  it('403 pour quelqu’un qui ne gère aucune équipe', async () => {
    seedInvitation();
    setAuthUser({ id: INVITEE_ID });
    const res = makeRes();

    await listHandler(makeReq(), res);

    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/teams/invitations/[invitationId] — relance', () => {
  it('remplace le lien privé, repousse l’expiration et renvoie l’email', async () => {
    const row = seedInvitation();
    const oldHash = (row.payload as any).invite_token_hash;
    const oldExpiry = (row.payload as any).expires_at;
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await invitationHandler(
      makeReq({ method: 'POST', query: { invitationId: INVITE_ID } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.status).toBe('resent');
    expect(body.email_sent).toBe(true);
    expect(sendTeamInviteLinkEmail).toHaveBeenCalledTimes(1);

    const stored = (store.demandes as any[]).find((d) => d.id === INVITE_ID);
    // L'ancien lien doit mourir : deux jetons valides en circulation pour une
    // même invitation, c'est une porte laissée ouverte.
    expect(stored.payload.invite_token_hash).not.toBe(oldHash);
    expect(Date.parse(stored.payload.expires_at)).toBeGreaterThan(
      Date.parse(oldExpiry)
    );

    // Le nouveau jeton n'est stocké QUE hashé.
    const token = body.invite_url.split('/invitation/')[1];
    expect(stored.payload.invite_token_hash).toBe(hashInviteToken(token));
    expect(JSON.stringify(stored.payload)).not.toContain(token);
  });

  it('un manager peut relancer une invitation émise par la capitaine', async () => {
    // L'équipe se gère à plusieurs : réserver l'action à l'émetteur laisserait
    // le manager constater un blocage sans pouvoir le lever.
    seedInvitation();
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();

    await invitationHandler(
      makeReq({ method: 'POST', query: { invitationId: INVITE_ID } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).status).toBe('resent');
  });

  it('400 quand l’invitation n’a pas d’email (rien à relancer)', async () => {
    seedInvitation({
      payload: {
        desired_role: 'player',
        expires_at: inDays(7),
        captain_auth_user_id: CAPTAIN_ID,
      },
    });
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await invitationHandler(
      makeReq({ method: 'POST', query: { invitationId: INVITE_ID } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('NO_INVITE_EMAIL');
    expect(sendTeamInviteLinkEmail).not.toHaveBeenCalled();
  });

  it('404 pour une invitation d’une autre équipe (pas de fuite d’existence)', async () => {
    seedInvitation({ id: OTHER_INVITE_ID, team_id: OTHER_TEAM_ID });
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await invitationHandler(
      makeReq({ method: 'POST', query: { invitationId: OTHER_INVITE_ID } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('INVITATION_NOT_FOUND');
  });

  it('400 sur un id qui n’est pas un UUID', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await invitationHandler(
      makeReq({ method: 'POST', query: { invitationId: 'not-a-uuid' } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_ID');
  });
});

describe('DELETE /api/teams/invitations/[invitationId] — annulation', () => {
  it('passe l’invitation en cancelled sans toucher au roster', async () => {
    seedInvitation();
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await invitationHandler(
      makeReq({ method: 'DELETE', query: { invitationId: INVITE_ID } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).status).toBe('cancelled');
    const stored = (store.demandes as any[]).find((d) => d.id === INVITE_ID);
    expect(stored.status).toBe('cancelled');
    expect(stored.processed_at).toBeTruthy();
    expect(store.team_members as any[]).toHaveLength(2);
  });

  it('404 sur une invitation déjà traitée', async () => {
    seedInvitation({ status: 'approved' });
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await invitationHandler(
      makeReq({ method: 'DELETE', query: { invitationId: INVITE_ID } }),
      res
    );

    expect(res.statusCode).toBe(404);
  });
});

describe('méthodes non supportées', () => {
  it('405 + Allow sur PUT', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await invitationHandler(
      makeReq({ method: 'PUT', query: { invitationId: INVITE_ID } }),
      res
    );

    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST, DELETE');
  });

  it('la liste annonce GET et POST', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await listHandler(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET, POST');
  });
});
