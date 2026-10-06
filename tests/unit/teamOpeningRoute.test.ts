// /api/teams/opening — l'annonce de recrutement posée depuis l'espace
// capitaine (lot P8). Ce qui compte :
//   1. l'annonce naît RATTACHÉE à l'équipe gérée (`team_id`), nom d'équipe
//      pris de l'équipe, contact = email du COMPTE (jamais une saisie) ;
//   2. une seule annonce par équipe : republier met à jour, sans réécrire le
//      contact, et repousse la péremption ;
//   3. la permission de recrutement est exigée ; clore supprime l'annonce de
//      CETTE équipe seulement.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

const emitBotEvent = vi.fn(async () => undefined);
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: (...args: unknown[]) => emitBotEvent(...(args as [])),
}));
const alertIfEntityBlacklisted = vi.fn(async () => undefined);
vi.mock('@/utils/moderation/entityBlacklist', () => ({
  alertIfEntityBlacklisted: (...args: unknown[]) =>
    alertIfEntityBlacklisted(...(args as [])),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setTableWriteError,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/teams/opening';

const TEAM = '11111111-1111-4111-8111-111111111111';
const OTHER_TEAM = '66666666-6666-4666-8666-666666666666';
const CAPTAIN = '22222222-2222-4222-8222-222222222222';
const PLAYER = '44444444-4444-4444-8444-444444444444';
const CAPTAIN_EMAIL = 'capitaine.phenix@gmail.com';

let _t = 0;
function makeReq(over: Partial<any> = {}): any {
  _t += 1;
  return {
    method: 'GET',
    url: '/api/teams/opening',
    headers: {
      host: 'h',
      authorization: `Bearer t-opening-${Date.now()}-${_t}`,
    },
    cookies: {},
    query: {},
    body: {},
    socket: { remoteAddress: `10.0.0.${_t % 250}` },
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

async function call(over: Partial<any> = {}) {
  const res = makeRes();
  await handler(makeReq(over), res);
  return res;
}

const openings = () => (store.team_openings ?? []) as any[];

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  emitBotEvent.mockClear();
  alertIfEntityBlacklisted.mockClear();
  setTableWriteError('team_openings', null);
  setAuthUser({ id: CAPTAIN, email: CAPTAIN_EMAIL });
  store.teams = [
    {
      id: TEAM,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Phenix',
      captain_id: CAPTAIN,
      is_active: true,
    },
    {
      id: OTHER_TEAM,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Autre',
      captain_id: '77777777-7777-4777-8777-777777777777',
      is_active: true,
    },
  ] as any;
  store.team_members = [
    {
      id: 'tm-cap',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM,
      user_id: CAPTAIN,
      role: 'player',
    },
    {
      id: 'tm-player',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM,
      user_id: PLAYER,
      role: 'player',
    },
  ] as any;
  store.team_member_permissions = [] as any;
  store.team_openings = [] as any;
});

describe('GET /api/teams/opening', () => {
  it('sans annonce : null, et annonce l’email qui servirait de contact', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      opening: null,
      accountEmail: CAPTAIN_EMAIL,
    });
  });

  it('ne lit que l’annonce rattachée à l’équipe gérée', async () => {
    store.team_openings = [
      {
        id: 'op-other',
        tenant_id: CONFERENCE_TENANT_ID,
        source: 'web',
        team_id: OTHER_TEAM,
        team_name: 'Autre',
        roles: ['tank'],
        contact_email: 'x@gmail.com',
        marked_at: '2026-10-01T00:00:00.000Z',
        expires_at: '2099-01-01T00:00:00.000Z',
      },
    ] as any;
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.opening).toBeNull();
  });
});

describe('PUT /api/teams/opening', () => {
  it('crée une annonce rattachée à l’équipe, contact = email du compte', async () => {
    const res = await call({
      method: 'PUT',
      body: {
        roles: ['support', 'tank', 'support'],
        level: 'gold',
        availability: 'Mar/jeu 21h',
        note: 'Ambiance chill',
        contactDiscord: 'phenix_cap',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(openings()).toHaveLength(1);
    expect(openings()[0]).toMatchObject({
      tenant_id: CONFERENCE_TENANT_ID,
      source: 'web',
      team_id: TEAM,
      team_name: 'Phenix',
      // Ordre canonique, dédupliqué.
      roles: ['tank', 'support'],
      level: 'gold',
      availability: 'Mar/jeu 21h',
      note: 'Ambiance chill',
      contact_email: CAPTAIN_EMAIL,
      contact_discord: 'phenix_cap',
    });
    expect(res.body.opening).toMatchObject({
      roles: ['tank', 'support'],
      level: 'gold',
      active: true,
      contactEmail: CAPTAIN_EMAIL,
    });
    // Même charge que la publication publique, sans contact.
    expect(emitBotEvent).toHaveBeenCalledTimes(1);
    const [event, payload] = emitBotEvent.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(event).toBe('team_opening.published');
    expect(payload).toMatchObject({
      teamName: 'Phenix',
      roles: ['tank', 'support'],
    });
    expect(JSON.stringify(payload)).not.toContain(CAPTAIN_EMAIL);
    expect(alertIfEntityBlacklisted).toHaveBeenCalled();
  });

  it('republier met à jour la même ligne sans réécrire le contact', async () => {
    store.team_openings = [
      {
        id: 'op-1',
        tenant_id: CONFERENCE_TENANT_ID,
        source: 'web',
        team_id: TEAM,
        team_name: 'Ancien nom',
        roles: ['dps'],
        level: 'unknown',
        contact_email: 'premiere.gerante@gmail.com',
        contact_discord: null,
        marked_at: '2026-08-01T00:00:00.000Z',
        expires_at: '2026-09-01T00:00:00.000Z',
      },
    ] as any;
    const res = await call({ method: 'PUT', body: { roles: ['flex'] } });
    expect(res.statusCode).toBe(200);
    expect(openings()).toHaveLength(1);
    const row = openings()[0];
    expect(row).toMatchObject({
      id: 'op-1',
      team_name: 'Phenix',
      roles: ['flex'],
      contact_email: 'premiere.gerante@gmail.com',
      marked_at: '2026-08-01T00:00:00.000Z',
    });
    // Péremption repoussée : l'annonce redevient visible.
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(res.body.opening.active).toBe(true);
    // Pas une nouvelle annonce : pas de nouvelle diffusion Discord.
    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('refuse sans poste recherché (400)', async () => {
    const res = await call({ method: 'PUT', body: { roles: [] } });
    expect(res.statusCode).toBe(400);
    expect(openings()).toHaveLength(0);
  });

  it('refuse un niveau inconnu (400)', async () => {
    const res = await call({
      method: 'PUT',
      body: { roles: ['tank'], level: 'legend' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuse un compte sans email utilisable (400 NO_CONTACT_EMAIL)', async () => {
    setAuthUser({ id: CAPTAIN, email: null });
    const res = await call({ method: 'PUT', body: { roles: ['tank'] } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('NO_CONTACT_EMAIL');
    expect(openings()).toHaveLength(0);
  });

  it('une joueuse sans droit de recrutement est refusée (403)', async () => {
    setAuthUser({ id: PLAYER, email: 'joueuse@gmail.com' });
    const res = await call({ method: 'PUT', body: { roles: ['tank'] } });
    expect(res.statusCode).toBe(403);
    expect(openings()).toHaveLength(0);
  });

  it('rend l’échec d’écriture visible (500), sans diffusion', async () => {
    setTableWriteError('team_openings', { message: 'boom' });
    const res = await call({ method: 'PUT', body: { roles: ['tank'] } });
    expect(res.statusCode).toBe(500);
    expect(emitBotEvent).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/teams/opening', () => {
  it('clôt l’annonce de l’équipe gérée, et seulement elle', async () => {
    store.team_openings = [
      {
        id: 'op-mine',
        tenant_id: CONFERENCE_TENANT_ID,
        source: 'web',
        team_id: TEAM,
        team_name: 'Phenix',
        roles: ['tank'],
        contact_email: CAPTAIN_EMAIL,
      },
      {
        id: 'op-other',
        tenant_id: CONFERENCE_TENANT_ID,
        source: 'web',
        team_id: OTHER_TEAM,
        team_name: 'Autre',
        roles: ['dps'],
        contact_email: 'x@gmail.com',
      },
    ] as any;
    const res = await call({ method: 'DELETE' });
    expect(res.statusCode).toBe(200);
    expect(res.body.opening).toBeNull();
    expect(openings().map((o) => o.id)).toEqual(['op-other']);
  });
});
