// tests/unit/adminTcgGrant.test.ts
//
// LA CORRECTION DE SOLDE PAR L'ÉQUIPE (`admin_grant`), épinglée.
//
// CE QUE CES TESTS PROTÈGENT VRAIMENT. Une correction de solde crée ou détruit
// de la monnaie : chaque défaut se traduit en pièces offertes ou volées, et
// aucun ne fait de bruit. Quatre familles :
//
//   1. LE REJEU. Un double-clic ou un retry réseau ne doit pas créditer deux
//      fois. On compte les LIGNES du registre, pas seulement la réponse.
//   2. LE PLANCHER. Un retrait ne rend jamais un solde négatif — y compris
//      quand le cache et le registre divergent (achat de booster en vol).
//   3. UNE ERREUR N'EST PAS UNE ABSENCE. Ni « compte introuvable » sur une
//      lecture en échec, ni « correction ratée » sur une écriture committée
//      dont seul l'accusé s'est perdu.
//   4. LA TRACE. Sans journal, une correction est indiscernable d'une création
//      de monnaie à partir de rien.
//
//   5. LE RATTACHEMENT À L'ESPACE (audit du 2026-09-15). Un owner d'espace tiers
//      ne crédite pas une joueuse qui ne joue pas chez lui : c'était la porte
//      d'entrée du vol de la récompense Battle.net unique (cf. le bloc dédié).
//
// Le retrait passe par la fonction SQL `tcg_admin_debit` : le mock n'exécute
// pas le SQL, on l'ÉMULE donc en JavaScript (`emulateAdminDebit`) pour tester
// ce que la ROUTE fait de chaque issue ; le SQL lui-même est vérifié par
// `tcgWalletAtomicSql.test.ts`, qui lit la migration.
//
// Le mock Supabase n'évalue ni `UNIQUE` ni `CHECK` : les conflits sont donc
// SIMULÉS (`setTableWriteError` + ligne semée au bon moment), et les colonnes
// utilisées ont été vérifiées contre `create_tcg_currency_tables.sql`
// (`tcg_wallet_entries`: id, tenant_id, user_id, amount, source_kind,
// source_ref, created_at ; `tcg_wallets`: tenant_id, user_id, balance,
// created_at, updated_at).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
  setRpcResult,
  setTableWriteError,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { logStaffAction } from '../../utils/staffLogs';

import grantHandler from '../../pages/api/admin/tcg/grant';

// UUID v4 BIEN FORMÉS : `z.string().uuid()` exige les nibbles de version et de
// variante — `1111-1111-…` serait rejeté en 400 avant la logique testée.
const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER_PLAYER = '22222222-2222-4222-8222-222222222222';
const STAFF_ROW = '55555555-5555-4555-8555-555555555555';
const STAFF_AUTH = '66666666-6666-4666-8666-666666666666';
const KEY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT = DEFAULT_TENANT_ID;

/* -------------------------------------------------------------------------- */
/* Doublures HTTP                                                              */
/* -------------------------------------------------------------------------- */

let _n = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}, auth = true) {
  _n += 1;
  const headers: Record<string, string> = {
    host: 'h',
    // Une IP par requête : le rate-limit (30/min) est testé ailleurs, il ne
    // doit pas faire échouer ici un cas qui n'a rien à voir avec lui.
    'x-real-ip': `10.0.${Math.floor(_n / 250)}.${_n % 250}`,
  };
  if (auth) headers.authorization = `Bearer t-${Date.now()}-${_n}`;
  // Sans jeton, la requête est traitée comme venant d’un navigateur : elle
  // doit porter une origine du même hôte pour passer le contrôle CSRF, sinon
  // on testerait le 403 CSRF au lieu du 401 d’authentification.
  else headers.origin = 'http://h';
  return {
    method: 'POST',
    headers,
    cookies: {},
    query: {},
    body: {},
    ...over,
  } as any;
}

function makeRes(): any {
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

function seedStaff(role: 'owner' | 'admin' | 'caster' = 'admin') {
  store.staff = [
    {
      id: STAFF_ROW,
      auth_user_id: STAFF_AUTH,
      email: 'staff@example.com',
      role,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ROW, role, created_at: '2026-01-01' },
  ] as any;
  setAuthUser({ id: STAFF_AUTH });
  invalidateStaffCache();
}

/** Un solde cohérent : une ligne de registre ET son cache. */
function seedBalance(coins: number, cache: number = coins) {
  store.tcg_wallet_entries = [
    {
      id: 'e0000000-0000-4000-8000-000000000001',
      tenant_id: TENANT,
      user_id: PLAYER,
      amount: coins,
      source_kind: 'match_win',
      source_ref: 'm-1',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.tcg_wallets = [
    {
      tenant_id: TENANT,
      user_id: PLAYER,
      balance: cache,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
}

function body(over: Record<string, unknown> = {}) {
  return {
    userId: PLAYER,
    amount: 150,
    reason: 'Victoire du 12/09 non créditée',
    idempotencyKey: KEY_A,
    ...over,
  };
}

async function callGrant(b: Record<string, unknown>, auth = true) {
  const res = makeRes();
  await grantHandler(makeReq({ body: b }, auth), res);
  return res;
}

const grants = () =>
  ((store.tcg_wallet_entries ?? []) as any[]).filter(
    (e) => e.source_kind === 'admin_grant'
  );
const cachedBalance = () =>
  ((store.tcg_wallets ?? []) as any[]).find((w) => w.user_id === PLAYER)
    ?.balance;

/**
 * Les deux joueuses sont sur un roster de l'espace : sans ce rattachement, la
 * route répond 404 avant toute écriture (cf. le bloc « rattachement »).
 */
function seedRosters(userIds: string[] = [PLAYER, OTHER_PLAYER]) {
  store.team_members = userIds.map((userId, i) => ({
    id: `f0000000-0000-4000-8000-00000000000${i}`,
    tenant_id: TENANT,
    team_id: 'c0000000-0000-4000-8000-000000000001',
    user_id: userId,
    role: 'player',
  })) as any;
}

/**
 * Émule `tcg_admin_debit` (migration `tcg_wallet_atomic_balance.sql`) sur le
 * store : somme du registre, refus sous zéro, 23505 sur clé déjà servie,
 * écriture + cache. Le verrou n'a pas d'équivalent en JavaScript mono-fil —
 * c'est le SQL qui le porte, et un autre test le lit.
 */
function emulateAdminDebit() {
  const realRpc = supabaseAdmin.rpc;
  return vi
    .spyOn(supabaseAdmin, 'rpc')
    .mockImplementation((fn: string, params?: any) => {
      if (fn !== 'tcg_admin_debit') return realRpc(fn, params);
      const entries = (store.tcg_wallet_entries ||= []) as any[];
      const mine = entries.filter(
        (e) =>
          e.tenant_id === params.p_tenant_id && e.user_id === params.p_user_id
      );
      const sum = mine.reduce((acc, e) => acc + e.amount, 0);
      const writeCache = (balance: number) => {
        const wallets = (store.tcg_wallets ||= []) as any[];
        const row = wallets.find(
          (w) =>
            w.tenant_id === params.p_tenant_id && w.user_id === params.p_user_id
        );
        if (row) row.balance = balance;
        else
          wallets.push({
            tenant_id: params.p_tenant_id,
            user_id: params.p_user_id,
            balance,
          });
      };
      if (sum < params.p_cost) {
        writeCache(Math.max(0, sum));
        return Promise.resolve({
          data: { status: 'insufficient', balance: Math.max(0, sum) },
          error: null,
        }) as any;
      }
      if (
        mine.some(
          (e) =>
            e.source_kind === 'admin_grant' &&
            e.source_ref === params.p_source_ref
        )
      ) {
        return Promise.resolve({
          data: null,
          error: { code: '23505', message: 'duplicate key' },
        }) as any;
      }
      const id = crypto.randomUUID();
      entries.push({
        id,
        tenant_id: params.p_tenant_id,
        user_id: params.p_user_id,
        amount: -params.p_cost,
        source_kind: 'admin_grant',
        source_ref: params.p_source_ref,
        note: params.p_note,
      });
      writeCache(sum - params.p_cost);
      return Promise.resolve({
        data: { status: 'ok', entry_id: id, balance: sum - params.p_cost },
        error: null,
      }) as any;
    });
}

beforeEach(() => {
  resetSupabaseMock();
  vi.mocked(logStaffAction).mockClear();
  vi.restoreAllMocks();
  seedStaff();
  seedRosters();
  setAdminUser(PLAYER, 'nova@example.com');
  setAdminUser(OTHER_PLAYER, 'kira@example.com');
});

/* -------------------------------------------------------------------------- */
/* Accès                                                                       */
/* -------------------------------------------------------------------------- */

describe('POST /api/admin/tcg/grant — accès', () => {
  it('401 sans session', async () => {
    const res = await callGrant(body(), false);
    expect(res.statusCode).toBe(401);
    expect(grants()).toHaveLength(0);
  });

  it('403 pour un rôle sans `manage_tcg`, et rien n’est écrit', async () => {
    seedStaff('caster');
    const res = await callGrant(body());
    expect(res.statusCode).toBe(403);
    expect(grants()).toHaveLength(0);
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('405 avec `Allow: POST` sur une autre méthode', async () => {
    const res = makeRes();
    await grantHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });
});

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

describe('POST /api/admin/tcg/grant — validation', () => {
  it.each([
    ['montant nul', { amount: 0 }],
    ['montant fractionnaire', { amount: 1.5 }],
    ['montant au-delà de la borne', { amount: 10_001 }],
    ['retrait au-delà de la borne', { amount: -10_001 }],
    ['montant en texte', { amount: '100' }],
    ['motif trop court', { reason: 'ok' }],
    ['motif trop court une fois rogné', { reason: '   ab   ' }],
    ['motif trop long', { reason: 'x'.repeat(501) }],
    ['userId non uuid', { userId: 'nova' }],
    ['clé non uuid', { idempotencyKey: '1111-1111' }],
    ['clé absente', { idempotencyKey: undefined }],
  ])('400 INVALID_BODY : %s', async (_label, over) => {
    const res = await callGrant(body(over));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(grants()).toHaveLength(0);
  });

  it('accepte la borne exacte (10 000)', async () => {
    const res = await callGrant(body({ amount: 10_000 }));
    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(10_000);
  });

  it('404 USER_NOT_FOUND pour un compte inconnu, sans écriture', async () => {
    const res = await callGrant(
      body({ userId: '33333333-3333-4333-8333-333333333333' })
    );
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
    expect(grants()).toHaveLength(0);
  });

  it('404 aussi quand GoTrue répond par une erreur 404', async () => {
    vi.spyOn(supabaseAdmin.auth.admin, 'getUserById').mockResolvedValueOnce({
      data: { user: null },
      error: { status: 404, code: 'user_not_found', message: 'User not found' },
    } as any);
    const res = await callGrant(body());
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('une lecture de compte EN ÉCHEC rend 500, jamais « introuvable »', async () => {
    vi.spyOn(supabaseAdmin.auth.admin, 'getUserById').mockResolvedValueOnce({
      data: { user: null },
      error: { status: 504, message: 'upstream timeout' },
    } as any);
    const res = await callGrant(body());
    expect(res.statusCode).toBe(500);
    expect(res.body.code).not.toBe('USER_NOT_FOUND');
    expect(grants()).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Crédit, registre et journal                                                 */
/* -------------------------------------------------------------------------- */

describe('POST /api/admin/tcg/grant — crédit', () => {
  it('écrit au REGISTRE et réaligne le cache', async () => {
    seedBalance(100);
    const res = await callGrant(body({ amount: 150 }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, balance: 250, replayed: false });

    const [entry] = grants();
    expect(entry).toMatchObject({
      tenant_id: TENANT,
      user_id: PLAYER,
      amount: 150,
      source_kind: 'admin_grant',
      // La clé d'idempotence EST la référence : c'est l'unicité du registre
      // qui interdit la seconde écriture.
      source_ref: KEY_A,
      // Le motif est recopié au registre : c'est ce que la joueuse lira dans
      // son historique (« Ajustement par l'équipe » seul ne disait rien).
      note: 'Victoire du 12/09 non créditée',
    });
    expect(res.body.entryId).toBe(entry.id);
    expect(cachedBalance()).toBe(250);
  });

  it('crée le cache d’une joueuse qui n’avait encore rien', async () => {
    const res = await callGrant(body({ amount: 40 }));
    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(40);
    expect(cachedBalance()).toBe(40);
  });

  it('journalise `tcg_admin_grant` avec userId, amount, reason, entryId', async () => {
    const res = await callGrant(body({ reason: '  Doublon payé deux fois  ' }));
    expect(logStaffAction).toHaveBeenCalledTimes(1);
    expect(logStaffAction).toHaveBeenCalledWith({
      staff_id: STAFF_ROW,
      action: 'tcg_admin_grant',
      entity_type: 'user',
      entity_id: PLAYER,
      tenant_id: TENANT,
      payload: {
        userId: PLAYER,
        amount: 150,
        // Rogné : le journal garde le motif tel qu'il a été validé.
        reason: 'Doublon payé deux fois',
        entryId: res.body.entryId,
      },
    });
  });

  it('un journal en échec ne transforme pas une correction écrite en erreur', async () => {
    vi.mocked(logStaffAction).mockRejectedValueOnce(new Error('logs down'));
    const res = await callGrant(body());
    expect(res.statusCode).toBe(200);
    expect(grants()).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Idempotence                                                                 */
/* -------------------------------------------------------------------------- */

describe('POST /api/admin/tcg/grant — idempotence', () => {
  it('rejouer la même clé ne crédite pas deux fois, et le dit', async () => {
    seedBalance(100);
    const first = await callGrant(body());
    const second = await callGrant(body());

    expect(first.body.replayed).toBe(false);
    expect(second.statusCode).toBe(200);
    expect(second.body).toEqual({
      ok: true,
      entryId: first.body.entryId,
      balance: 250,
      replayed: true,
    });
    expect(grants()).toHaveLength(1);
    expect(cachedBalance()).toBe(250);
    // Un rejeu n'est pas une seconde correction : une seule trace.
    expect(logStaffAction).toHaveBeenCalledTimes(1);
  });

  it('deux clés distinctes = deux corrections', async () => {
    await callGrant(body({ idempotencyKey: KEY_A }));
    const res = await callGrant(body({ idempotencyKey: KEY_B }));
    expect(res.body.replayed).toBe(false);
    expect(grants()).toHaveLength(2);
    expect(res.body.balance).toBe(300);
  });

  it('refuse une clé recyclée pour une AUTRE joueuse (400), sans écrire', async () => {
    await callGrant(body());
    const res = await callGrant(body({ userId: OTHER_PLAYER }));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(grants()).toHaveLength(1);
  });

  it('refuse une clé recyclée pour un AUTRE montant (400)', async () => {
    await callGrant(body({ amount: 150 }));
    const res = await callGrant(body({ amount: 1500 }));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(grants()).toHaveLength(1);
  });

  /**
   * Fait apparaître une ligne `admin_grant` au MOMENT où la route ouvre sa
   * n-ième requête sur le registre — c'est-à-dire entre sa relecture préalable
   * et son insertion, comme le ferait une requête concurrente.
   */
  function injectEntryOnRegistryCall(n: number, row: Record<string, unknown>) {
    const realFrom = supabaseAdmin.from;
    let calls = 0;
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'tcg_wallet_entries') {
        calls += 1;
        if (calls === n) (store.tcg_wallet_entries ||= []).push(row as any);
      }
      return realFrom(table);
    });
  }

  it('course sur la même clé : le perdant (23505) répond `replayed: true`', async () => {
    seedBalance(100);
    const winner = {
      id: 'e0000000-0000-4000-8000-00000000beef',
      tenant_id: TENANT,
      user_id: PLAYER,
      amount: 150,
      source_kind: 'admin_grant',
      source_ref: KEY_A,
    };
    // Appel n°1 = relecture préalable (vide), n°2 = rattachement (gains
    // réels), n°3 = insertion (refusée).
    injectEntryOnRegistryCall(3, winner);
    setTableWriteError('tcg_wallet_entries', {
      message: 'duplicate key value violates unique constraint',
      code: '23505',
    } as any);

    const res = await callGrant(body());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ entryId: winner.id, replayed: true });
    expect(grants()).toHaveLength(1);
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('écriture committée malgré une erreur : succès, pas un rejeu', async () => {
    const committed = {
      id: 'e0000000-0000-4000-8000-00000000cafe',
      tenant_id: TENANT,
      user_id: PLAYER,
      amount: 150,
      source_kind: 'admin_grant',
      source_ref: KEY_A,
    };
    injectEntryOnRegistryCall(3, committed);
    setTableWriteError('tcg_wallet_entries', { message: '504 upstream' });

    const res = await callGrant(body());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ entryId: committed.id, replayed: false });
    // La correction a eu lieu : elle doit être tracée.
    expect(logStaffAction).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Retrait — une transaction SQL                                               */
/* -------------------------------------------------------------------------- */

describe('POST /api/admin/tcg/grant — retrait', () => {
  it('retire des pièces quand le solde le permet', async () => {
    seedBalance(300);
    emulateAdminDebit();
    const res = await callGrant(body({ amount: -100 }));
    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(200);
    expect(grants()[0]).toMatchObject({
      amount: -100,
      source_ref: KEY_A,
      note: 'Victoire du 12/09 non créditée',
    });
    expect(cachedBalance()).toBe(200);
    expect(logStaffAction).toHaveBeenCalledTimes(1);
  });

  it('passe par `tcg_admin_debit` avec un coût POSITIF, et n’écrit pas le registre lui-même', async () => {
    seedBalance(300);
    const spy = emulateAdminDebit();
    const insertSpy = vi.fn();
    const realFrom = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      const builder = realFrom(table) as any;
      if (table === 'tcg_wallet_entries') {
        const realInsert = builder.insert.bind(builder);
        builder.insert = (...args: unknown[]) => {
          insertSpy(...args);
          return realInsert(...args);
        };
      }
      return builder;
    });
    await callGrant(body({ amount: -100 }));
    expect(spy).toHaveBeenCalledWith('tcg_admin_debit', {
      p_tenant_id: TENANT,
      p_user_id: PLAYER,
      p_cost: 100,
      p_source_ref: KEY_A,
      p_note: 'Victoire du 12/09 non créditée',
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('peut ramener un solde exactement à zéro', async () => {
    seedBalance(100);
    emulateAdminDebit();
    const res = await callGrant(body({ amount: -100 }));
    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(0);
  });

  it('409 INSUFFICIENT_BALANCE si le retrait rendrait le solde négatif', async () => {
    seedBalance(50);
    emulateAdminDebit();
    const res = await callGrant(body({ amount: -100 }));
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      balance: 50,
    });
    expect(grants()).toHaveLength(0);
    expect(cachedBalance()).toBe(50);
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('409 sur un compte sans aucun solde', async () => {
    emulateAdminDebit();
    const res = await callGrant(body({ amount: -1 }));
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('le REGISTRE fait foi, pas un cache resté haut', async () => {
    seedBalance(50, 500);
    emulateAdminDebit();
    const res = await callGrant(body({ amount: -100 }));
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('migration absente : 503 WITHDRAWAL_UNAVAILABLE, rien d’écrit (jamais un retrait sans verrou)', async () => {
    seedBalance(300);
    setRpcResult('tcg_admin_debit', {
      error: { code: 'PGRST202', message: 'Could not find the function' },
    });
    const res = await callGrant(body({ amount: -100 }));
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('WITHDRAWAL_UNAVAILABLE');
    expect(grants()).toHaveLength(0);
    expect(cachedBalance()).toBe(300);
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('verrou non obtenu : 409 BALANCE_CHANGED', async () => {
    seedBalance(300);
    setRpcResult('tcg_admin_debit', {
      error: { code: '55P03', message: 'lock not available' },
    });
    const res = await callGrant(body({ amount: -100 }));
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('BALANCE_CHANGED');
  });

  it('course sur la même clé (23505) : `replayed: true`, pas de second retrait', async () => {
    seedBalance(300);
    const winner = {
      id: 'e0000000-0000-4000-8000-00000000dead',
      tenant_id: TENANT,
      user_id: PLAYER,
      amount: -100,
      source_kind: 'admin_grant',
      source_ref: KEY_A,
    };
    setRpcResult('tcg_admin_debit', {
      error: { code: '23505', message: 'duplicate key' },
    });
    // La requête concurrente a écrit APRÈS la relecture préalable.
    const realRpc = supabaseAdmin.rpc;
    vi.spyOn(supabaseAdmin, 'rpc').mockImplementation(
      (fn: string, params?: any) => {
        if (fn === 'tcg_admin_debit') {
          (store.tcg_wallet_entries as any[]).push(winner);
        }
        return realRpc(fn, params);
      }
    );
    const res = await callGrant(body({ amount: -100 }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ entryId: winner.id, replayed: true });
    expect(grants()).toHaveLength(1);
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('panne après commit (504) : relit par la clé, succès tracé', async () => {
    seedBalance(300);
    const committed = {
      id: 'e0000000-0000-4000-8000-00000000f00d',
      tenant_id: TENANT,
      user_id: PLAYER,
      amount: -100,
      source_kind: 'admin_grant',
      source_ref: KEY_A,
    };
    setRpcResult('tcg_admin_debit', { error: { message: '504 upstream' } });
    const realRpc = supabaseAdmin.rpc;
    vi.spyOn(supabaseAdmin, 'rpc').mockImplementation(
      (fn: string, params?: any) => {
        if (fn === 'tcg_admin_debit') {
          (store.tcg_wallet_entries as any[]).push(committed);
        }
        return realRpc(fn, params);
      }
    );
    const res = await callGrant(body({ amount: -100 }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      entryId: committed.id,
      replayed: false,
      balance: 200,
    });
    expect(logStaffAction).toHaveBeenCalledTimes(1);
  });

  it('panne sans écriture : 500, rien d’écrit ni de tracé', async () => {
    seedBalance(300);
    setRpcResult('tcg_admin_debit', { error: { message: 'boom' } });
    const res = await callGrant(body({ amount: -100 }));
    expect(res.statusCode).toBe(500);
    expect(grants()).toHaveLength(0);
    expect(logStaffAction).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Rattachement à l'espace (audit du 2026-09-15)                               */
/* -------------------------------------------------------------------------- */

describe('POST /api/admin/tcg/grant — seulement une joueuse de l’espace', () => {
  // SCÉNARIO D'ATTAQUE. L'owner d'un espace B (un espace développeur se crée en
  // libre-service) crédite +1 pièce à une joueuse qui ne joue que dans A.
  // AVANT : 200 — le crédit créait un porte-monnaie dans B, que le rattrapage
  // Battle.net de B prenait pour un rattachement, et la récompense UNIQUE de la
  // joueuse était consommée dans B. APRÈS : 404, rien d'écrit, et la route ne
  // dit même pas si le compte existe.
  it('refuse (404 USER_NOT_FOUND) une joueuse sans roster ni gain dans l’espace, sans consulter GoTrue', async () => {
    store.team_members = [
      {
        id: 'f0000000-0000-4000-8000-0000000000aa',
        tenant_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        team_id: 'c0000000-0000-4000-8000-000000000002',
        user_id: PLAYER,
        role: 'player',
      },
    ] as any;
    const lookup = vi.spyOn(supabaseAdmin.auth.admin, 'getUserById');

    const res = await callGrant(body({ amount: 1 }));

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
    expect(grants()).toHaveLength(0);
    expect(store.tcg_wallets ?? []).toHaveLength(0);
    expect(lookup).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('un porte-monnaie fait de SEULES corrections staff ne rattache pas', async () => {
    store.team_members = [] as any;
    store.tcg_wallet_entries = [
      {
        id: 'e0000000-0000-4000-8000-000000000a01',
        tenant_id: TENANT,
        user_id: PLAYER,
        amount: 1,
        source_kind: 'admin_grant',
        source_ref: KEY_B,
      },
    ] as any;
    store.tcg_wallets = [
      { tenant_id: TENANT, user_id: PLAYER, balance: 1 },
    ] as any;

    const res = await callGrant(body({ amount: 5 }));
    expect(res.statusCode).toBe(404);
    expect(grants()).toHaveLength(1);
  });

  it('une supportrice sans roster, rattachée par un gain réel (drop Twitch), reste corrigeable', async () => {
    store.team_members = [] as any;
    store.tcg_wallet_entries = [
      {
        id: 'e0000000-0000-4000-8000-000000000a02',
        tenant_id: TENANT,
        user_id: PLAYER,
        amount: 25,
        source_kind: 'twitch_drop',
        source_ref: 'live-1',
      },
    ] as any;
    const res = await callGrant(body({ amount: 5 }));
    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(30);
  });

  it('un rattachement illisible rend 500, jamais « introuvable » ni une écriture', async () => {
    const realFrom = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      const builder = realFrom(table) as any;
      if (table === 'team_members') {
        builder.then = (resolve: (r: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'timeout' } }).then(
            resolve
          );
      }
      return builder;
    });
    const res = await callGrant(body({ amount: 5 }));
    expect(res.statusCode).toBe(500);
    expect(res.body.code).not.toBe('USER_NOT_FOUND');
    expect(grants()).toHaveLength(0);
  });
});
