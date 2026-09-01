// Tests pour /api/admin/documents — le Drive de l'association.
//
// Ce qui est réellement protégé ici, c'est l'ORDRE des contrôles dans le
// handler. Le PUT qui enregistre la clé privée doit passer AVANT le contrôle
// « le Drive est-il configuré ? », puisque poser la clé est précisément le
// geste qui rend le Drive configuré. À l'envers — ce qui a été livré le
// 2026-09-01 — l'écran d'installation proposait un champ dont l'enregistrement
// répondait « le Drive n'est pas configuré » à tous les coups.
//
// Le reste (403 sans le droit d'écriture, refus d'une valeur qui n'est pas un
// PEM, 409 sans clé de chiffrement) protège des messages qui font chercher au
// mauvais endroit.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import documentsHandler from '../../pages/api/admin/documents';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

// Une clé PEM plausible : le handler ne fait qu'un contrôle de FORME avant de
// chiffrer, il ne signe rien ici.
const FAKE_PEM =
  '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQ\n-----END PRIVATE KEY-----\n';

function makeStaffRow(role: 'admin' | 'helper' = 'admin'): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'PUT',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    cookies: {},
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
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  store.integration_secrets = [] as any;
  process.env.SECRETS_ENC_KEY = 'clé-de-test-pour-le-chiffrement';
  // L'adresse est posée, la clé ne l'est pas : c'est exactement l'état dans
  // lequel l'écran propose de coller la clé.
  process.env.GOOGLE_DRIVE_SA_EMAIL = 'asso@projet.iam.gserviceaccount.com';
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'folder-1';
  delete process.env.GOOGLE_DRIVE_SA_KEY;
  delete process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY;
});

afterEach(() => {
  delete process.env.SECRETS_ENC_KEY;
  delete process.env.GOOGLE_DRIVE_SA_EMAIL;
  delete process.env.GOOGLE_DRIVE_FOLDER_ID;
});

describe('PUT — enregistrer la clé privée', () => {
  it('aboutit alors que le Drive n’est PAS encore configuré', async () => {
    // LA régression du 2026-09-01 : le PUT était dispatché après le contrôle de
    // configuration, donc il répondait 409 « le Drive n'est pas configuré » —
    // alors que c'est le geste qui le configure.
    const req = makeReq({ body: { privateKey: FAKE_PEM } });
    const res = makeRes();
    await documentsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ stored: true });
  });

  it('chiffre la valeur — jamais de clé en clair en base', async () => {
    const req = makeReq({ body: { privateKey: FAKE_PEM } });
    await documentsHandler(req, makeRes());

    const row = (store.integration_secrets as any[])[0];
    expect(row?.key).toBe('google_drive_sa_private_key');
    expect(row?.value_encrypted).toBeTruthy();
    expect(row.value_encrypted).not.toContain('BEGIN');
    expect(row.value_encrypted.startsWith('v1.')).toBe(true);
  });

  it('refuse une valeur qui n’est pas un PEM, AVANT de la chiffrer', async () => {
    // Sans ce contrôle, un mauvais collage serait accepté, chiffré, et
    // n'échouerait qu'au premier appel à Google — avec un message d'OpenSSL
    // incompréhensible, très loin de la cause.
    const req = makeReq({ body: { privateKey: 'ceci n’est pas une clé' } });
    const res = makeRes();
    await documentsHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(store.integration_secrets).toHaveLength(0);
  });

  it('répond 409 explicite quand la clé de chiffrement manque', async () => {
    delete process.env.SECRETS_ENC_KEY;
    delete process.env.TWITCH_TOKEN_ENC_KEY;
    const req = makeReq({ body: { privateKey: FAKE_PEM } });
    const res = makeRes();
    await documentsHandler(req, res);

    expect(res.statusCode).toBe(409);
    expect(String((res.body as any)?.error)).toContain('SECRETS_ENC_KEY');
  });

  it('ne journalise jamais la valeur de la clé', async () => {
    // Un journal se relit, s'exporte en CSV et se partage. On n'y met que le
    // fait que le geste a eu lieu.
    await documentsHandler(
      makeReq({ body: { privateKey: FAKE_PEM } }),
      makeRes()
    );

    const logs = (store.staff_logs as any[]) ?? [];
    const entry = logs.find((l) => l.action === 'store_drive_credentials');
    expect(entry).toBeTruthy();
    expect(JSON.stringify(entry)).not.toContain('BEGIN');
  });
});

describe('GET — état d’installation', () => {
  it('distingue « en attente de la clé » de « rien n’est configuré »', async () => {
    // Sans cette distinction, on renvoie quelqu'un créer un compte de service
    // qu'il a déjà fait.
    const res = makeRes();
    await documentsHandler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      configured: false,
      awaitingPrivateKey: true,
      canStoreKey: true,
    });
  });
});
