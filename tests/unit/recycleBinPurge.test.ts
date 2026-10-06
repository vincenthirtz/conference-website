// Corbeille cohérente + purge (lot A4).
//
//   1. plannings de scrim, tâches et actualités apparaissent dans la corbeille
//      et se restaurent ;
//   2. une actualité supprimée passe en corbeille (deleted_at + brouillon), avec
//      repli sur l'effacement d'avant tant que la migration manque ;
//   3. « Supprimer définitivement » : owner seul, types purgeables seuls,
//      jamais une donnée vivante, adhérent à cotisations anonymisé, journalisé ;
//   4. le cron purge ce qui dort depuis plus de PURGE_RETENTION_DAYS.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { restoreTaskCoreMock } = vi.hoisted(() => ({
  restoreTaskCoreMock: vi.fn(),
}));
vi.mock('@/utils/taskBoard', async (orig) => ({
  ...(await orig<typeof import('../../utils/taskBoard')>()),
  restoreTaskCore: restoreTaskCoreMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import type { ServiceContext } from '../../utils/admin/serviceContext';

import recycleBinHandler from '../../pages/api/admin/recycle-bin';
import cronHandler from '../../pages/api/cron/recycle-bin-purge';
import {
  listRecycleBin,
  purgeFromRecycleBin,
  restoreFromRecycleBin,
} from '../../features/admin/recycle-bin/service';
import {
  purgeCutoff,
  runRecycleBinPurge,
} from '../../features/admin/recycle-bin/purge';
import {
  ANONYMIZED_ADHERENT_EMAIL_SUFFIX,
  PURGE_RETENTION_DAYS,
} from '../../features/admin/recycle-bin/schemas';
import { isMissingColumnError } from '../../features/admin/recycle-bin/missingColumn';
import { deleteNews, listNews } from '../../features/admin/news/repository';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ME = '55555555-5555-4555-8555-555555555555';
const PLAN_A = '11111111-1111-4111-8111-111111111111';
const PLAN_B = '22222222-2222-4222-8222-222222222222';
const NEWS_A = '33333333-3333-4333-8333-333333333333';
const TASK_A = '44444444-4444-4444-8444-444444444444';
const TEAM_A = '66666666-6666-4666-8666-666666666666';
const ADH_PAID = '77777777-7777-4777-8777-777777777777';
const ADH_FREE = '88888888-8888-4888-8888-888888888888';
const PARTNER = '99999999-9999-4999-8999-999999999999';

type Row = Record<string, unknown>;

const NOW = new Date('2026-10-06T12:00:00.000Z');
const OLD = '2026-06-01T00:00:00.000Z'; // > 90 j avant NOW
const RECENT = '2026-09-30T00:00:00.000Z'; // < 90 j

function staffRow(role: StaffMember['role'], isPoleAdmin = false): StaffMember {
  return {
    id: ME,
    auth_user_id: 'user-me',
    email: 'me@x.test',
    role,
    display_name: 'me',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_pole_admin: isPoleAdmin,
    is_active: true,
  } as StaffMember;
}

function seedCaller(
  globalRole: StaffMember['role'],
  tenantRole?: StaffMember['role']
) {
  store.staff = [staffRow(globalRole)] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'a', name: 'A', is_active: true },
    { id: TENANT_B, slug: 'b', name: 'B', is_active: true },
  ] as any;
  store.tenant_staff = tenantRole
    ? ([{ tenant_id: TENANT_A, staff_id: ME, role: tenantRole }] as any)
    : ([] as any);
  invalidateStaffCache();
  invalidateTenantAccessCache();
}

let n = 0;
function makeReq(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-a4-${n}` },
    cookies: { staff_active_tenant_id: TENANT_A },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end() {
      return this;
    },
  };
}

const logger = { error() {}, warn() {}, info() {}, debug() {} } as any;
function svc(tenantId = TENANT_A): ServiceContext {
  return {
    db: supabaseAdmin as any,
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

function seedBin() {
  store.scrim_plannings = [
    {
      id: PLAN_A,
      tenant_id: TENANT_A,
      title: 'A vs B',
      status: 'open',
      deleted_at: OLD,
    },
    {
      id: PLAN_B,
      tenant_id: TENANT_B,
      title: 'Autre espace',
      status: 'open',
      deleted_at: OLD,
    },
  ] as any;
  store.tasks = [
    {
      id: TASK_A,
      tenant_id: TENANT_A,
      title: 'Préparer le stream',
      priority: 'high',
      deleted_at: RECENT,
    },
  ] as any;
  store.news = [
    {
      id: NEWS_A,
      tenant_id: TENANT_A,
      title: 'Annonce',
      slug: 'annonce',
      status: 'draft',
      deleted_at: OLD,
    },
  ] as any;
  store.teams = [
    {
      id: TEAM_A,
      tenant_id: TENANT_A,
      name: 'Equipe',
      is_active: false,
      deleted_at: OLD,
    },
  ] as any;
  store.adherents = [
    {
      id: ADH_PAID,
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@x.test',
      phone: '0600000000',
      deleted_at: OLD,
    },
    {
      id: ADH_FREE,
      first_name: 'Grace',
      last_name: 'Hopper',
      email: 'grace@x.test',
      deleted_at: OLD,
    },
  ] as any;
  store.adherent_payments = [
    { id: 'pay-1', adherent_id: ADH_PAID, year: 2026, amount: 10 },
  ] as any;
  store.partners = [
    { id: PARTNER, name: 'Sponsor', category: 'gold', deleted_at: RECENT },
  ] as any;
  store.staff_logs = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: 'user-me' });
  seedCaller('owner');
  seedBin();
  restoreTaskCoreMock.mockReset();
});

/* 1. liste + restauration ------------------------------------------------- */

describe('1. corbeille : plannings, tâches, actualités', () => {
  it('liste les nouveaux types de SON espace, avec le drapeau purgeable', async () => {
    const { items } = await listRecycleBin(
      svc(),
      { platform: true },
      {},
      { limit: 50, offset: 0 }
    );
    const byType = new Map(items.map((i) => [i.type, i]));
    expect(byType.get('scrim_planning')?.id).toBe(PLAN_A);
    expect(byType.get('task')?.name).toBe('Préparer le stream');
    expect(byType.get('news')?.details).toBe('annonce');
    expect(byType.get('news')?.purgeable).toBe(true);
    expect(byType.get('team')?.purgeable).toBe(false);
    // Le planning de l'autre espace n'apparaît pas.
    expect(items.some((i) => i.id === PLAN_B)).toBe(false);
  });

  it('un adhérent anonymisé sort de la corbeille', async () => {
    (store.adherents as Row[])[0].email =
      `purged-${ADH_PAID}${ANONYMIZED_ADHERENT_EMAIL_SUFFIX}`;
    const { items } = await listRecycleBin(
      svc(),
      { platform: true },
      { type: 'adherent' },
      { limit: 50, offset: 0 }
    );
    expect(items.map((i) => i.id)).toEqual([ADH_FREE]);
  });

  it('restaure un planning et une actualité', async () => {
    await restoreFromRecycleBin(
      svc(),
      { platform: false },
      { id: PLAN_A, type: 'scrim_planning' }
    );
    await restoreFromRecycleBin(
      svc(),
      { platform: false },
      { id: NEWS_A, type: 'news' }
    );
    expect((store.scrim_plannings as Row[])[0].deleted_at).toBeNull();
    const news = (store.news as Row[])[0];
    expect(news.deleted_at).toBeNull();
    expect(news.status).toBe('draft'); // à republier sciemment
  });

  it('restaure une tâche par restoreTaskCore (repositionnement Kanban)', async () => {
    restoreTaskCoreMock.mockResolvedValue({ ok: true, task: {} });
    const out = await restoreFromRecycleBin(
      svc(),
      { platform: false, staffId: ME },
      { id: TASK_A, type: 'task' }
    );
    expect(out.result).toEqual({ restored: true, type: 'task', id: TASK_A });
    expect(restoreTaskCoreMock).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      taskId: TASK_A,
      actorStaffId: ME,
    });
  });

  it('tâche : 409 du cœur Kanban relayé tel quel', async () => {
    restoreTaskCoreMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "La colonne d'origine n'existe plus",
      code: 'column_gone',
    });
    const err = await rejects(
      restoreFromRecycleBin(
        svc(),
        { platform: false },
        { id: TASK_A, type: 'task' }
      )
    );
    expect(err.status).toBe(409);
    expect(err.legacyCode).toBe('column_gone');
  });
});

/* 2. actualités : suppression douce -------------------------------------- */

describe('2. actualités : suppression douce', () => {
  beforeEach(() => {
    store.news = [
      {
        id: NEWS_A,
        tenant_id: TENANT_A,
        title: 'En ligne',
        slug: 'en-ligne',
        status: 'published',
        deleted_at: null,
        published_at: '2026-09-01T00:00:00.000Z',
      },
    ] as any;
  });

  it('met en corbeille + brouillon, et disparaît de la liste admin', async () => {
    const { slug, error } = await deleteNews(
      supabaseAdmin as any,
      TENANT_A,
      NEWS_A
    );
    expect(error).toBeNull();
    expect(slug).toBe('en-ligne');
    const row = (store.news as Row[])[0];
    expect(row).toBeDefined(); // la ligne reste
    expect(row.deleted_at).toEqual(expect.any(String));
    expect(row.status).toBe('draft'); // invisible des lectures publiques
    const { rows } = await listNews(supabaseAdmin as any, TENANT_A, {
      limit: 10,
    });
    expect(rows).toHaveLength(0);
  });

  it('sans la colonne (migration absente) : effacement d’avant', async () => {
    const calls: string[] = [];
    const missing = {
      code: 'PGRST204',
      message: "Could not find the 'deleted_at' column of 'news'",
    };
    const chain = (op: string) => {
      const c: any = {
        eq: () => c,
        is: () => c,
        select: () => c,
        maybeSingle: async () => {
          calls.push(op);
          return op === 'update'
            ? { data: null, error: missing }
            : { data: { slug: 'en-ligne' }, error: null };
        },
      };
      return c;
    };
    const db = {
      from: () => ({
        update: () => chain('update'),
        delete: () => chain('delete'),
      }),
    };
    const { slug, error } = await deleteNews(db as any, TENANT_A, NEWS_A);
    expect(calls).toEqual(['update', 'delete']);
    expect(error).toBeNull();
    expect(slug).toBe('en-ligne');
  });

  it('isMissingColumnError : restreint à la colonne nommée', () => {
    expect(
      isMissingColumnError(
        { code: '42703', message: 'column news.deleted_at does not exist' },
        'deleted_at'
      )
    ).toBe(true);
    expect(
      isMissingColumnError(
        { code: '42703', message: 'column news.foo does not exist' },
        'deleted_at'
      )
    ).toBe(false);
    expect(isMissingColumnError({ code: '23505' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});

/* 3. suppression définitive (owner) -------------------------------------- */

describe('3. DELETE /api/admin/recycle-bin : suppression définitive', () => {
  it('refusé : un admin (non owner) ne purge pas', async () => {
    seedCaller('admin', 'admin');
    const res = makeRes();
    await recycleBinHandler(
      makeReq({
        method: 'DELETE',
        query: { id: PLAN_A, type: 'scrim_planning' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(store.scrim_plannings as Row[]).toHaveLength(2);
  });

  it('autorisé : l’owner purge un planning de son espace, journalisé', async () => {
    seedCaller('owner', 'owner');
    const res = makeRes();
    await recycleBinHandler(
      makeReq({
        method: 'DELETE',
        query: { id: PLAN_A, type: 'scrim_planning' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      purged: true,
      type: 'scrim_planning',
      mode: 'deleted',
    });
    expect((store.scrim_plannings as Row[]).map((p) => p.id)).toEqual([PLAN_B]);
    const log = (store.staff_logs as Row[]).find(
      (l) => l.action === 'purge_deleted_item'
    );
    expect(log).toMatchObject({
      entity_type: 'scrim_planning',
      entity_id: PLAN_A,
    });
  });

  it('400 : type ou id invalides', async () => {
    const res = makeRes();
    await recycleBinHandler(
      makeReq({ method: 'DELETE', query: { id: 'x', type: 'news' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('409 NOT_PURGEABLE : l’historique des tournois ne s’efface pas', async () => {
    const err = await rejects(
      purgeFromRecycleBin(
        svc(),
        { platform: true },
        { id: TEAM_A, type: 'team' }
      )
    );
    expect(err.status).toBe(409);
    expect(err.legacyCode).toBe('NOT_PURGEABLE');
    expect(store.teams as Row[]).toHaveLength(1);
  });

  it('404 : jamais une donnée vivante, ni celle d’un autre espace', async () => {
    (store.scrim_plannings as Row[])[0].deleted_at = null;
    const live = await rejects(
      purgeFromRecycleBin(
        svc(),
        { platform: false },
        { id: PLAN_A, type: 'scrim_planning' }
      )
    );
    expect(live.status).toBe(404);
    const other = await rejects(
      purgeFromRecycleBin(
        svc(),
        { platform: false },
        { id: PLAN_B, type: 'scrim_planning' }
      )
    );
    expect(other.status).toBe(404);
    expect(store.scrim_plannings as Row[]).toHaveLength(2);
  });

  it('403 : un owner d’espace ne purge pas un adhérent (table globale)', async () => {
    const err = await rejects(
      purgeFromRecycleBin(
        svc(),
        { platform: false },
        { id: ADH_FREE, type: 'adherent' }
      )
    );
    expect(err.status).toBe(403);
    expect(store.adherents as Row[]).toHaveLength(2);
  });

  it('adhérent à cotisations : anonymisé, cotisations gardées', async () => {
    const out = await purgeFromRecycleBin(
      svc(),
      { platform: true },
      { id: ADH_PAID, type: 'adherent' }
    );
    expect(out.result.mode).toBe('anonymized');
    const row = (store.adherents as Row[]).find((a) => a.id === ADH_PAID)!;
    expect(row.first_name).toBe('Adhérent');
    expect(row.email).toBe(
      `purged-${ADH_PAID}${ANONYMIZED_ADHERENT_EMAIL_SUFFIX}`
    );
    expect(row.phone).toBeNull();
    expect(store.adherent_payments as Row[]).toHaveLength(1);
    // Le journal ne garde pas la donnée effacée.
    expect(JSON.stringify(out.audit)).not.toContain('Lovelace');
    // Déjà anonymisé : plus purgeable.
    const again = await rejects(
      purgeFromRecycleBin(
        svc(),
        { platform: true },
        { id: ADH_PAID, type: 'adherent' }
      )
    );
    expect(again.status).toBe(404);
  });

  it('adhérent sans cotisation : supprimé', async () => {
    const out = await purgeFromRecycleBin(
      svc(),
      { platform: true },
      { id: ADH_FREE, type: 'adherent' }
    );
    expect(out.result.mode).toBe('deleted');
    expect((store.adherents as Row[]).some((a) => a.id === ADH_FREE)).toBe(
      false
    );
  });
});

/* 4. cron ----------------------------------------------------------------- */

describe('4. purge automatique au-delà de PURGE_RETENTION_DAYS', () => {
  it('cutoff = now - 90 j', () => {
    expect(PURGE_RETENTION_DAYS).toBe(90);
    expect(purgeCutoff(NOW)).toBe('2026-07-08T12:00:00.000Z');
  });

  it('purge les anciens, garde les récents et les types exclus', async () => {
    const report = await runRecycleBinPurge(supabaseAdmin as any, NOW);
    // Anciens : plannings (2 espaces), actualité, adhérents.
    expect(store.scrim_plannings as Row[]).toHaveLength(0);
    expect(store.news as Row[]).toHaveLength(0);
    expect((store.adherents as Row[]).map((a) => a.id)).toEqual([ADH_PAID]);
    expect((store.adherents as Row[])[0].first_name).toBe('Adhérent');
    // Récents : tâche, partenaire. Exclus : équipe.
    expect(store.tasks as Row[]).toHaveLength(1);
    expect(store.partners as Row[]).toHaveLength(1);
    expect(store.teams as Row[]).toHaveLength(1);

    expect(report.types.scrim_planning).toMatchObject({ deleted: 2 });
    expect(report.types.adherent).toMatchObject({
      deleted: 1,
      anonymized: 1,
    });
    expect(report.types.team).toBeUndefined();

    const logs = (store.staff_logs as Row[]).filter(
      (l) => l.action === 'purge_deleted_item'
    );
    expect(logs).toHaveLength(5);
    expect(logs.every((l) => l.staff_id === null)).toBe(true);
    expect(logs.find((l) => l.entity_id === PLAN_B)?.tenant_id).toBe(TENANT_B);
    expect((logs[0].payload as Row).automatic).toBe(true);

    // Second passage : l'adhérent anonymisé n'est pas retraité.
    const again = await runRecycleBinPurge(supabaseAdmin as any, NOW);
    expect(again.types.adherent).toMatchObject({ candidates: 0 });
  });

  it('cron : 401 sans secret, 200 avec', async () => {
    process.env.CRON_SECRET = 'cron-secret-a4';
    const denied = makeRes();
    await cronHandler(
      { method: 'POST', headers: {}, query: {} } as any,
      denied
    );
    expect(denied.statusCode).toBe(401);

    const ok = makeRes();
    await cronHandler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer cron-secret-a4' },
        query: {},
      } as any,
      ok
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.body.retention_days).toBe(90);

    const wrong = makeRes();
    await cronHandler({ method: 'PUT', headers: {}, query: {} } as any, wrong);
    expect(wrong.statusCode).toBe(405);
  });
});
