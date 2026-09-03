// tests/unit/apiAdminRotateSecretsGrace.test.ts
//
// T8 — rotation des secrets bot sans coupure.
//
// `tenant_secrets` ne portait qu'UNE empreinte : régénérer invalidait l'ancienne
// à la milliseconde où l'écran affichait la nouvelle, donc coupait le bot en
// place jusqu'à ce que quelqu'un aille reposer la valeur sur le serveur. Une
// fenêtre de panne pour un geste qui devrait être anodin.
//
// Ce que ces tests tiennent :
//   - pendant la fenêtre, les DEUX clés authentifient ;
//   - passé l'échéance, l'ancienne vaut une clé inconnue ;
//   - la révocation coupe l'ancienne SANS toucher à la nouvelle ;
//   - une clé jamais émise n'ouvre rien (le cas où tout garde-fou s'effondre).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { verifyBotApiKeyMultiTenant } from '../../utils/botAuth';
import rotateHandler from '../../pages/api/admin/tenants/[id]/rotate-secrets';

const TENANT = CONFERENCE_TENANT_ID;
const USER = 'user-1';
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

let _t = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  _t += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    cookies: {},
    query: { id: TENANT },
    body: {},
    ...over,
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

/** Le middleware d'auth bot lit l'en-tête `x-api-key`. */
const keyReq = (key: string): any => ({ headers: { 'x-api-key': key } });

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: USER });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: USER,
      email: 'a@a.com',
      role: 'owner',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [
    { id: TENANT, slug: 'conf', name: 'Conf', is_active: true },
  ] as any;
  store.tenant_secrets = [
    {
      tenant_id: TENANT,
      bot_api_key_hash: sha('ancienne-cle'),
      bot_webhook_secret: 'w',
      previous_key_hash: null,
      previous_key_expires_at: null,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: 'staff-1', role: 'owner' },
  ] as any;
});

describe('rotation sans coupure', () => {
  it('les deux clés authentifient pendant la fenêtre', async () => {
    const res = makeRes();
    await rotateHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const nouvelle = (res.body as any).botApiKey as string;
    expect((res.body as any).previousKeyValidUntil).toBeTruthy();

    // La nouvelle, évidemment.
    expect(await verifyBotApiKeyMultiTenant(keyReq(nouvelle))).toMatchObject({
      ok: true,
      tenantId: TENANT,
    });
    // Et l'ancienne, qui tient le bot en vie le temps du déploiement.
    expect(
      await verifyBotApiKeyMultiTenant(keyReq('ancienne-cle'))
    ).toMatchObject({ ok: true, tenantId: TENANT });
  });

  it('passé l’échéance, l’ancienne clé vaut une clé inconnue', async () => {
    const res = makeRes();
    await rotateHandler(makeReq(), res);
    // On fait vieillir la fenêtre plutôt que d'attendre 48 h.
    (store.tenant_secrets as any[])[0].previous_key_expires_at = new Date(
      Date.now() - 1000
    ).toISOString();

    expect(await verifyBotApiKeyMultiTenant(keyReq('ancienne-cle'))).toEqual({
      ok: false,
    });
  });

  it('une clé jamais émise n’ouvre rien', async () => {
    expect(
      await verifyBotApiKeyMultiTenant(keyReq('cle-inventee'))
    ).toEqual({ ok: false });
  });

  it('la révocation coupe l’ancienne, pas la nouvelle', async () => {
    const rotate = makeRes();
    await rotateHandler(makeReq(), rotate);
    const nouvelle = (rotate.body as any).botApiKey as string;

    const del = makeRes();
    await rotateHandler(makeReq({ method: 'DELETE' }), del);
    expect(del.statusCode).toBe(200);
    expect((del.body as any).previousKeyRevoked).toBe(true);

    expect(await verifyBotApiKeyMultiTenant(keyReq('ancienne-cle'))).toEqual({
      ok: false,
    });
    expect(await verifyBotApiKeyMultiTenant(keyReq(nouvelle))).toMatchObject({
      ok: true,
    });
  });

  it('un espace sans clé antérieure n’ouvre pas de fenêtre', async () => {
    store.tenant_secrets = [] as any;
    const res = makeRes();
    await rotateHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    // Rien à faire cohabiter : annoncer une fenêtre serait un mensonge.
    expect((res.body as any).previousKeyValidUntil).toBeNull();
  });

  it('405 sur une méthode qui n’est ni POST ni DELETE', async () => {
    const res = makeRes();
    await rotateHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});
