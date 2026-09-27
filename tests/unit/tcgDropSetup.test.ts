// POST /api/admin/twitch/tcg-drop/setup — mettre le drop TCG en service.
//
// POURQUOI CETTE ROUTE, ET DONC CES CAS. Toute la chaîne était livrée — la
// récompense se crée, l'abonnement EventSub se pose, le webhook est signé et
// testé — mais RIEN ne reliait les deux écritures : le POST de l'abonnement
// n'avait aucune interface. Mesuré le 2026-09-27 : chaîne connectée, dix-huit
// comptes rattachés, **zéro crédit versé**.
//
// LE CAS QUI COMPTE EST LA REPRISE. Enchaîner « créer » puis « abonner » depuis
// un navigateur laisse, au premier échec du second, une récompense orpheline
// SUR LA CHAÎNE — visible des spectatrices. Le clic suivant en créerait une
// seconde. On relit donc nos récompenses avant d'en poser une, et ce test est
// ce qui empêche quelqu'un de « simplifier » en supprimant la lecture.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

process.env.TWITCH_TOKEN_ENC_KEY = 'test-enc-key-please-change';
process.env.TWITCH_CLIENT_SECRET = 'test-client-secret';
process.env.TWITCH_CLIENT_ID = 'test-client-id';
process.env.TWITCH_REDIRECT_URI =
  'https://example.test/api/twitch/broadcaster-callback';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { encryptSecret } from '../../utils/crypto';
import { BROADCASTER_SCOPES } from '../../utils/twitchBroadcaster';
import handler, {
  TCG_DROP_REWARD_TITLE,
} from '../../pages/api/admin/twitch/tcg-drop/setup';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-mgr-1',
    auth_user_id: 'user-1',
    email: 'mgr@x.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let counter = 0;
function makeReq(body: unknown = {}): any {
  counter += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-${counter}` },
    query: {},
    cookies: {},
    body,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seedConnection(scope: string[] = [...BROADCASTER_SCOPES]) {
  store.twitch_broadcaster_connections = [
    {
      tenant_id: TENANT_X,
      broadcaster_id: 'bc-123',
      broadcaster_login: 'mychannel',
      access_token_enc: encryptSecret('live-access-token'),
      refresh_token_enc: encryptSecret('live-refresh-token'),
      scope,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      connected_by_user_id: 'user-1',
    },
  ] as any;
}

/** Réponses successives de Helix : liste, puis création. */
function mockHelix(responses: { ok: boolean; payload: unknown }[]) {
  let i = 0;
  const fetchMock = vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return { ok: r.ok, status: r.ok ? 200 : 400, json: async () => r.payload };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  logStaffActionMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/admin/twitch/tcg-drop/setup', () => {
  it('crée la récompense quand elle n’existe pas', async () => {
    seedConnection();
    const fetchMock = mockHelix([
      { ok: true, payload: { data: [] } },
      { ok: true, payload: { data: [{ id: 'rw-1' }] } },
    ]);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ rewardId: 'rw-1', reused: false });

    // La création porte le titre qui sert de clé de reprise, et saute la file
    // d'attente de la chaîne : un échange en attente ne nous parviendrait pas.
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent.title).toBe(TCG_DROP_REWARD_TITLE);
    expect(sent.should_redemptions_skip_request_queue).toBe(true);
    expect(sent.is_user_input_required).toBe(false);
  });

  it('REPREND la récompense existante au lieu d’en créer une seconde', async () => {
    // LE CAS CENTRAL. Sans lui, un second passage poserait une deuxième
    // récompense sur la chaîne, visible des spectatrices.
    seedConnection();
    const fetchMock = mockHelix([
      {
        ok: true,
        payload: { data: [{ id: 'rw-existante', title: TCG_DROP_REWARD_TITLE }] },
      },
    ]);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ rewardId: 'rw-existante', reused: true });
    // Une seule requête : la lecture. Aucune création.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ne demande QUE nos récompenses', async () => {
    // `only_manageable_rewards=true` : une récompense créée à la main dans la
    // console appartient à la chaîne, pas à notre client_id — Helix refuse
    // alors de la gérer, et la chaîne paraîtrait montée en restant inerte.
    seedConnection();
    const fetchMock = mockHelix([
      { ok: true, payload: { data: [] } },
      { ok: true, payload: { data: [{ id: 'rw-1' }] } },
    ]);
    await handler(makeReq(), makeRes());

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('only_manageable_rewards=true');
  });

  it('409 quand aucune chaîne n’est connectée', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('not_connected');
  });

  it('409 quand il manque le droit de LIRE les échanges', async () => {
    // Le droit de créer ne suffit pas : sans `channel:read:redemptions`,
    // Twitch refuse l'abonnement et la récompense ne déclencherait jamais rien.
    seedConnection(
      BROADCASTER_SCOPES.filter((s) => s !== 'channel:read:redemptions')
    );
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('missing_scope');
  });

  it('502 quand Twitch refuse la création', async () => {
    seedConnection();
    mockHelix([
      { ok: true, payload: { data: [] } },
      { ok: false, payload: { message: 'CREATE_CUSTOM_REWARD_DUPLICATE_REWARD' } },
    ]);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(502);
    expect((res.body as any).code).toBe('reward_create_failed');
  });

  it('refuse un coût invalide', async () => {
    seedConnection();
    const res = makeRes();
    await handler(makeReq({ cost: 0 }), res);
    expect(res.statusCode).toBe(400);
  });

  it('refuse une méthode autre que POST', async () => {
    const res = makeRes();
    await handler({ ...makeReq(), method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });
});
