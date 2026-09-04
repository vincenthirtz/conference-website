// tests/unit/developersRegister.test.ts
//
// Tests du handler self-service de l'« espace développeur » :
// `pages/api/developers/register.ts`. Calqué sur apiAuthRegister.test.ts pour
// les conventions (makeReq/makeRes, mock emailDns, mock supabase in-memory).
//
// Couverture :
//  - 405 méthode non-POST
//  - 400 VALIDATION (orgName court / password < 8 / email invalide)
//  - 400 CAPTCHA (Turnstile invalide)
//  - 200 succès + provisioning (tenant kind='developer', staff owner,
//    tenant_staff owner)
//  - 200 { alreadyExists:true } sans provisioning quand l'email est déjà pris
//  - collision de slug → suffixe -2

import { describe, it, expect, vi, beforeEach } from 'vitest';

// La route consomme supabaseAdmin (+ supabaseAnonServer conservé par parité).
vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    supabaseAnonServer: m.supabaseAnonServer,
  };
});

// Pas de vrai DNS en unit : le check de domaine répond OK par défaut.
vi.mock('@/utils/emailDns', () => ({
  checkEmailDomainDns: vi.fn(async () => ({ ok: true })),
}));

// Turnstile stubbé globalement : chaque test flippe le résultat voulu.
const verifyMock = vi.fn();
vi.mock('@/utils/turnstile', () => ({
  verifyTurnstileToken: (...args: unknown[]) => verifyMock(...args),
}));

import {
  store,
  resetSupabaseMock,
  setCreateUserResult,
} from './__helpers__/supabaseMock';
import { checkEmailDomainDns } from '@/utils/emailDns';

import registerHandler from '../../pages/api/developers/register';

function makeReq(over: Partial<any> = {}): any {
  const { headers: overHeaders, ...rest } = over;
  return {
    method: 'POST',
    query: {},
    body: {},
    ...rest,
    headers: { host: 'h', ...(overHeaders || {}) },
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const validBody = {
  email: 'Founder@Gmail.com',
  password: 'motdepasse8',
  orgName: 'Acme Corp',
  turnstileToken: 'cf-token-fake',
};

beforeEach(() => {
  resetSupabaseMock();
  verifyMock.mockReset();
  verifyMock.mockResolvedValue({ ok: true });
  // createUser réussit par défaut avec un user connu (id 'gen-user').
  setCreateUserResult({
    data: { user: { id: 'gen-user', email: 'founder@gmail.com' } },
    error: null,
  });
});

describe('/api/developers/register', () => {
  it('405 sur méthode non-POST', async () => {
    const res = makeRes();
    await registerHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('400 VALIDATION quand orgName est trop court', async () => {
    const res = makeRes();
    await registerHandler(
      makeReq({ body: { ...validBody, orgName: 'A' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    // Rien ne doit être provisionné.
    expect(store.tenants ?? []).toHaveLength(0);
  });

  it('400 VALIDATION quand le mot de passe fait moins de 8 caractères', async () => {
    const res = makeRes();
    await registerHandler(
      makeReq({ body: { ...validBody, password: 'court' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('400 VALIDATION quand l’email est invalide', async () => {
    const res = makeRes();
    await registerHandler(
      makeReq({ body: { ...validBody, email: 'pas-un-email' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('400 CAPTCHA quand Turnstile échoue', async () => {
    verifyMock.mockResolvedValueOnce({ ok: false, error: 'Captcha invalide.' });
    const res = makeRes();
    await registerHandler(makeReq({ body: validBody }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CAPTCHA');
    // Aucun compte / tenant créé si le captcha ne passe pas.
    expect(store.tenants ?? []).toHaveLength(0);
  });

  it('400 VALIDATION quand le domaine email est introuvable en DNS', async () => {
    vi.mocked(checkEmailDomainDns).mockResolvedValueOnce({
      ok: false,
      reason: 'domain_unresolvable',
    });
    const res = makeRes();
    await registerHandler(makeReq({ body: validBody }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(store.tenants ?? []).toHaveLength(0);
  });

  it('200 succès + provisionne tenant developer / staff owner / tenant_staff owner', async () => {
    const res = makeRes();
    await registerHandler(makeReq({ body: validBody }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });

    // 1) tenant marqué kind='developer'.
    const tenant = (store.tenants ?? []).find(
      (t: any) => t.kind === 'developer'
    ) as any;
    expect(tenant).toBeTruthy();
    expect(tenant.name).toBe('Acme Corp');
    expect(tenant.is_active).toBe(true);
    expect(typeof tenant.slug).toBe('string');
    expect(tenant.slug.length).toBeGreaterThanOrEqual(2);

    // 2) staff role 'owner' rattaché au compte auth créé + email normalisé.
    const staff = (store.staff ?? []).find(
      (s: any) => s.role === 'owner'
    ) as any;
    expect(staff).toBeTruthy();
    expect(staff.auth_user_id).toBe('gen-user');
    expect(staff.email).toBe('founder@gmail.com');
    expect(staff.display_name).toBe('Acme Corp');

    // 3) tenant_staff role 'owner' liant le staff au tenant.
    const ts = (store.tenant_staff ?? []).find(
      (r: any) => r.role === 'owner'
    ) as any;
    expect(ts).toBeTruthy();
    expect(ts.tenant_id).toBe(tenant.id);
    expect(ts.staff_id).toBe(staff.id);
  });

  it('l’espace développeur naît sur l’essai Régie, pas sur le palier sans API', async () => {
    // Sans plan explicite, l'insert prenait le défaut de la colonne —
    // `discovery` — qui n'ouvre PAS l'API. Le tunnel « self-service » livrait
    // donc une clé qui répondait 403 à chaque appel. `regie` est le premier
    // palier avec `apiRead` : c'est exactement ce qu'un espace développeur
    // vient chercher.
    const res = makeRes();
    await registerHandler(makeReq({ body: validBody }), res);
    expect(res.statusCode).toBe(200);

    const tenant = (store.tenants ?? []).find(
      (t: any) => t.kind === 'developer'
    ) as any;
    expect(tenant.plan).toBe('regie');
    expect(tenant.plan_is_trial).toBe(true);
    expect(tenant.plan_status).toBe('active');
    // Une échéance existe : le cron plan-renewal la relance puis la fait
    // retomber. Un essai sans date ne finirait jamais.
    expect(typeof tenant.plan_expires_at).toBe('string');
    expect(Date.parse(tenant.plan_expires_at)).toBeGreaterThan(Date.now());
  });

  it('email déjà pris → 200 { alreadyExists:true } sans provisioning', async () => {
    setCreateUserResult({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    });
    const res = makeRes();
    await registerHandler(makeReq({ body: validBody }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok', alreadyExists: true });
    // Anti-énumération : aucun tenant / staff n'est créé.
    expect(store.tenants ?? []).toHaveLength(0);
    expect(store.staff ?? []).toHaveLength(0);
    expect(store.tenant_staff ?? []).toHaveLength(0);
  });

  it('collision de slug → suffixe -2 sur le slug du tenant créé', async () => {
    // Un tenant existant occupe déjà le slug dérivé de « Acme Corp ».
    store.tenants = [
      { id: 't-existing', slug: 'acme-corp', name: 'Acme Corp', kind: 'organizer' },
    ] as any;

    const res = makeRes();
    await registerHandler(makeReq({ body: validBody }), res);

    expect(res.statusCode).toBe(200);
    const created = (store.tenants ?? []).find(
      (t: any) => t.kind === 'developer'
    ) as any;
    expect(created).toBeTruthy();
    expect(created.slug).toBe('acme-corp-2');
  });
});
