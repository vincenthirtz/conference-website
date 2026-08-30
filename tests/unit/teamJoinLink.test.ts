// Unit tests — « lien d'équipe » : auto-inscription au roster SANS email.
//
//   GET/POST/DELETE /api/teams/invite-links          → gestion (capitaine/manager)
//   GET/POST        /api/teams/invite-links/by-token → consultation / inscription
//
// Ce qui est vérifié ici, et pourquoi :
//   - le jeton n'existe qu'une fois : renvoyé en clair à la création, jamais
//     stocké autrement que hashé, jamais réaffiché par le GET de gestion ;
//   - régénérer RÉVOQUE le lien précédent (un seul lien vivant par équipe) ;
//   - anti-escalade : un manager ne peut pas fabriquer un lien « manager » ;
//   - le lien n'authentifie pas : POST sans session → 401 ;
//   - un lien à usage unique l'est vraiment : la 2ᵉ entrée est refusée ;
//   - un lien révoqué / expiré est indistinguable d'un lien inconnu (404/410
//     avec le même message), pour ne pas confirmer l'existence d'une équipe.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  setRpcResult,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import { hashInviteToken } from '../../utils/teams/inviteLinks';
import linksHandler from '../../pages/api/teams/invite-links/index';
import byTokenHandler from '../../pages/api/teams/invite-links/by-token';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MANAGER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const NEWCOMER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

let _tok = 0;
function freshAuthToken() {
  _tok += 1;
  return `t-${Date.now()}-${_tok}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshAuthToken()}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined as unknown, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seedTeam() {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      slug: 'alpha',
      short_name: 'ALP',
      logo_url: null,
      captain_id: CAPTAIN_ID,
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
  store.team_invite_links = [];
}

/** Génère un lien en tant que capitaine et renvoie le jeton en clair. */
async function createLink(body: Record<string, unknown> = {}): Promise<string> {
  setAuthUser({ id: CAPTAIN_ID });
  const res = makeRes();
  await linksHandler(makeReq({ method: 'POST', body }), res);
  expect(res.statusCode).toBe(201);
  const url = (res.body as any).url as string;
  return url.split('/rejoindre/')[1];
}

beforeEach(() => {
  resetSupabaseMock();
  emitRoleSyncEvent.mockClear();
  seedTeam();
});

describe('POST /api/teams/invite-links', () => {
  it('la capitaine génère un lien : jeton en clair une fois, hash en base', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await linksHandler(
      makeReq({ method: 'POST', body: { role: 'player' } }),
      res
    );

    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.url).toMatch(/\/rejoindre\//);
    expect(body.token).toBeTruthy();
    expect(body.link.role).toBe('player');

    const rows = store.team_invite_links as any[];
    expect(rows).toHaveLength(1);
    // Le jeton en clair n'est nulle part.
    expect(rows[0].token_hash).toBe(hashInviteToken(body.token));
    expect(JSON.stringify(rows[0])).not.toContain(body.token);
  });

  it('un manager NE PEUT PAS fabriquer un lien « manager » (anti-escalade)', async () => {
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();

    await linksHandler(
      makeReq({ method: 'POST', body: { role: 'manager' } }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('ROLE_ESCALATION');
    expect(store.team_invite_links as any[]).toHaveLength(0);
  });

  it('un manager peut générer un lien « joueuse »', async () => {
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();

    await linksHandler(
      makeReq({ method: 'POST', body: { role: 'player' } }),
      res
    );

    expect(res.statusCode).toBe(201);
  });

  it('régénérer révoque le lien précédent : un seul lien vivant', async () => {
    const first = await createLink();
    const second = await createLink();

    expect(second).not.toBe(first);
    const rows = store.team_invite_links as any[];
    expect(rows).toHaveLength(2);
    const active = rows.filter((r) => r.revoked_at == null);
    expect(active).toHaveLength(1);
    expect(active[0].token_hash).toBe(hashInviteToken(second));
  });

  it('refuse un corps invalide (max_uses hors bornes)', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await linksHandler(makeReq({ method: 'POST', body: { max_uses: 0 } }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
  });
});

describe('GET / DELETE /api/teams/invite-links', () => {
  it('GET rend l’état du lien, jamais le jeton', async () => {
    await createLink({ max_uses: 3 });
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await linksHandler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const link = (res.body as any).link;
    expect(link.max_uses).toBe(3);
    expect(link.usable).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('token');
  });

  it('GET sans lien actif renvoie null', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await linksHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).link).toBeNull();
  });

  it('DELETE révoque le lien actif', async () => {
    const token = await createLink();
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await linksHandler(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(200);
    const rows = store.team_invite_links as any[];
    expect(rows[0].revoked_at).toBeTruthy();

    // Et le lien ne marche plus côté visiteur.
    const res2 = makeRes();
    await byTokenHandler(makeReq({ method: 'GET', query: { token } }), res2);
    expect(res2.statusCode).toBe(410);
  });
});

describe('GET /api/teams/invite-links/by-token', () => {
  it('décrit l’équipe sans session (le lien n’authentifie pas)', async () => {
    const token = await createLink();
    const res = makeRes();

    await byTokenHandler(
      makeReq({ method: 'GET', query: { token }, headers: { host: 'h' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.team.name).toBe('Alpha');
    expect(body.role).toBe('player');
    expect(body.battle_tag_required).toBe(true);
    // Rien qui identifie qui a créé le lien, ni le roster.
    expect(JSON.stringify(body)).not.toContain(CAPTAIN_ID);
  });

  it('jeton inconnu → 404, même message qu’un lien mort', async () => {
    const res = makeRes();
    await byTokenHandler(
      makeReq({ method: 'GET', query: { token: 'x'.repeat(40) } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as any).error).toMatch(/invalide ou expiré/i);
  });
});

describe('POST /api/teams/invite-links/by-token — inscription', () => {
  beforeEach(() => {
    setRpcResult('accept_invitation', {
      data: { id: 'tm-new', team_id: TEAM_ID, user_id: NEWCOMER_ID },
      error: null,
    });
  });

  it('inscrit la personne connectée au roster', async () => {
    const token = await createLink();
    setAuthUser({ id: NEWCOMER_ID });
    const res = makeRes();

    await byTokenHandler(
      makeReq({
        method: 'POST',
        body: { token, battle_tag: 'Newbie#1234' },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).joined).toBe(true);
    expect((res.body as any).team.name).toBe('Alpha');

    // L'entrée laisse la même trace qu'un recrutement classique.
    const invites = (store.demandes as any[]).filter(
      (d) => d.type === 'invite'
    );
    expect(invites).toHaveLength(1);
    expect(invites[0].user_id).toBe(NEWCOMER_ID);
    expect(invites[0].payload.desired_role).toBe('player');

    // Une entrée consommée.
    expect((store.team_invite_links as any[])[0].uses_count).toBe(1);
  });

  it('exige le BattleTag pour un rôle jouant', async () => {
    const token = await createLink();
    setAuthUser({ id: NEWCOMER_ID });
    const res = makeRes();

    await byTokenHandler(makeReq({ method: 'POST', body: { token } }), res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('BATTLE_TAG_REQUIRED');
    // Rien n'a été consommé.
    expect((store.team_invite_links as any[])[0].uses_count).toBe(0);
  });

  it('un lien à usage unique ne sert qu’une fois', async () => {
    const token = await createLink({ max_uses: 1 });

    setAuthUser({ id: NEWCOMER_ID });
    const first = makeRes();
    await byTokenHandler(
      makeReq({ method: 'POST', body: { token, battle_tag: 'Alpha#1111' } }),
      first
    );
    expect(first.statusCode).toBe(200);

    const other = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    setAuthUser({ id: other });
    const second = makeRes();
    await byTokenHandler(
      makeReq({ method: 'POST', body: { token, battle_tag: 'Bravo#2222' } }),
      second
    );

    // Le lien est épuisé : refusé AVANT toute écriture sur le roster.
    expect(second.statusCode).toBe(410);
    expect((second.body as any).code).toBe('EXHAUSTED');
  });

  it('sans session : 401 — le lien n’authentifie pas', async () => {
    const token = await createLink();
    const res = makeRes();

    await byTokenHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h' },
        body: { token, battle_tag: 'Nobody#4444' },
      }),
      res
    );

    expect(res.statusCode).toBe(401);
    expect((store.team_invite_links as any[])[0].uses_count).toBe(0);
  });

  it('déjà membre : on le dit, sans consommer d’entrée', async () => {
    const token = await createLink();
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();

    await byTokenHandler(
      makeReq({ method: 'POST', body: { token, battle_tag: 'Charlie#3333' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).already_member).toBe(true);
    expect((res.body as any).joined).toBe(false);
    expect((store.team_invite_links as any[])[0].uses_count).toBe(0);
  });
});
