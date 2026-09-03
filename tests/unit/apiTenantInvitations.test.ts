// tests/unit/apiTenantInvitations.test.ts
//
// T6 — inviter quelqu'un dans un espace.
//
// Jusqu'ici `POST /tenants/:id/staff` exigeait un `staff_id` DÉJÀ en base :
// donner un accès à quelqu'un qui n'avait jamais mis les pieds sur la
// plateforme demandait de lui créer un compte à la main, ailleurs, puis de
// revenir.
//
// Ce que ces tests tiennent :
//   - le jeton n'est stocké que haché (un dump de base ne donne aucun accès) ;
//   - une invitation est NOMINATIVE : un autre compte ne peut pas la consommer ;
//   - elle est à usage unique, expire, et se révoque ;
//   - accepter crée le compte staff s'il manque, mais ne donne JAMAIS un rôle
//     global élevé : l'accès vaut pour un espace, via `tenant_staff`.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});
vi.mock('@/utils/email', () => ({
  sendEmail: vi.fn(async () => ({ success: true })),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setCookieUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import listHandler from '../../pages/api/admin/tenants/[id]/invitations/index';
import revokeHandler from '../../pages/api/admin/tenants/[id]/invitations/[invitationId]';
import publicHandler from '../../pages/api/invitations/[token]';

const TENANT = CONFERENCE_TENANT_ID;
const OWNER = 'user-owner';
const INVITEE = 'user-invitee';
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

let _t = 0;
function req(over: Partial<Record<string, unknown>> = {}): any {
  _t += 1;
  return {
    method: 'GET',
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: OWNER });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  store.staff = [
    {
      id: 'staff-owner',
      auth_user_id: OWNER,
      email: 'owner@conf.fr',
      role: 'owner',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [
    { id: TENANT, slug: 'conf', name: 'Conf', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: 'staff-owner', role: 'owner' },
  ] as any;
  store.tenant_invitations = [] as any;
});

async function invite(email = 'nouvelle@exemple.fr', role = 'admin') {
  const res = makeRes();
  await listHandler(req({ method: 'POST', body: { email, role } }), res);
  return res;
}

describe('POST /api/admin/tenants/[id]/invitations', () => {
  it('crée une invitation et ne stocke QUE l’empreinte du jeton', async () => {
    const res = await invite();
    expect(res.statusCode).toBe(201);

    const row = (store.tenant_invitations as any[])[0];
    expect(row.email).toBe('nouvelle@exemple.fr');
    expect(row.role).toBe('admin');
    // Le jeton en clair ne doit apparaître NULLE PART en base.
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('token"');
  });

  it('refuse d’inviter à un rôle supérieur au sien', async () => {
    (store.staff as any[])[0].role = 'admin';
    // Le rôle EFFECTIF est élevé par `tenant_staff` : ne baisser que le rôle
    // global laisserait l'invitant owner ici.
    (store.tenant_staff as any[])[0].role = 'admin';
    invalidateStaffCache();
    invalidateTenantAccessCache();
    const res = await invite('x@y.fr', 'owner');
    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('ROLE_ABOVE_INVITER');
  });

  it('refuse d’inviter quelqu’un qui est déjà membre', async () => {
    store.staff = [
      ...(store.staff as any[]),
      {
        id: 'staff-2',
        auth_user_id: 'u2',
        email: 'deja@conf.fr',
        role: 'caster',
        is_active: true,
        deleted_at: null,
      },
    ] as any;
    store.tenant_staff = [
      ...(store.tenant_staff as any[]),
      { tenant_id: TENANT, staff_id: 'staff-2', role: 'caster' },
    ] as any;

    const res = await invite('deja@conf.fr', 'caster');
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('ALREADY_MEMBER');
  });

  it('révoque l’invitation précédente de la même adresse', async () => {
    await invite('meme@exemple.fr');
    await invite('meme@exemple.fr');
    const rows = store.tenant_invitations as any[];
    expect(rows).toHaveLength(2);
    // Une seule vivante : sinon deux jetons valides, et un seul révocable.
    expect(rows.filter((r) => !r.revoked_at && !r.accepted_at)).toHaveLength(1);
  });
});

describe('acceptation publique', () => {
  /** Récupère le jeton en clair depuis l'email simulé. */
  async function inviteAndToken(email = 'nouvelle@exemple.fr') {
    const { buildInvitationEmail } = await import(
      '../../utils/tenants/invitationEmail'
    );
    const spy = vi.spyOn(
      await import('../../utils/tenants/invitationEmail'),
      'buildInvitationEmail'
    );
    spy.mockImplementation((opts: Parameters<typeof buildInvitationEmail>[0]) => {
      capturedToken = opts.token;
      return buildInvitationEmail(opts);
    });
    await invite(email);
    spy.mockRestore();
    return capturedToken;
  }
  let capturedToken = '';

  it('accepte, crée le compte staff et rattache — sans rôle global élevé', async () => {
    const token = await inviteAndToken();
    setCookieUser({ id: INVITEE, email: 'nouvelle@exemple.fr' });

    const res = makeRes();
    await publicHandler(req({ method: 'POST', query: { token } }), res);
    expect(res.statusCode).toBe(200);

    const created = (store.staff as any[]).find(
      (s) => s.auth_user_id === INVITEE
    );
    expect(created).toBeTruthy();
    // L'invitation donne un accès à UN espace, pas un rôle sur la plateforme.
    expect(created.role).toBe('caster');
    const link = (store.tenant_staff as any[]).find(
      (l) => l.staff_id === created.id
    );
    expect(link.role).toBe('admin');
  });

  it('refuse un compte dont l’adresse n’est pas celle invitée', async () => {
    const token = await inviteAndToken('cible@exemple.fr');
    setCookieUser({ id: 'autre', email: 'quelqun.dautre@exemple.fr' });

    const res = makeRes();
    await publicHandler(req({ method: 'POST', query: { token } }), res);
    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('EMAIL_MISMATCH');
  });

  it('est à usage unique', async () => {
    const token = await inviteAndToken();
    setCookieUser({ id: INVITEE, email: 'nouvelle@exemple.fr' });

    const first = makeRes();
    await publicHandler(req({ method: 'POST', query: { token } }), first);
    expect(first.statusCode).toBe(200);

    const second = makeRes();
    await publicHandler(req({ method: 'POST', query: { token } }), second);
    expect(second.statusCode).toBe(409);
    expect((second.body as any).code).toBe('ACCEPTED');
  });

  it('refuse une invitation expirée', async () => {
    const token = await inviteAndToken();
    (store.tenant_invitations as any[])[0].expires_at = new Date(
      Date.now() - 1000
    ).toISOString();
    setCookieUser({ id: INVITEE, email: 'nouvelle@exemple.fr' });

    const res = makeRes();
    await publicHandler(req({ method: 'POST', query: { token } }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('EXPIRED');
  });

  it('le GET décrit l’invitation sans la consommer, et masque l’adresse', async () => {
    const token = await inviteAndToken('marie.dupont@exemple.fr');
    const res = makeRes();
    await publicHandler(req({ method: 'GET', query: { token } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.status).toBe('pending');
    expect(body.tenantName).toBe('Conf');
    expect(body.emailHint).toBe('m***@exemple.fr');
    // Rien n'est consommé par une simple lecture.
    expect((store.tenant_invitations as any[])[0].accepted_at).toBeFalsy();
  });

  it('un jeton inconnu ne dit rien', async () => {
    const res = makeRes();
    await publicHandler(
      req({ method: 'GET', query: { token: 'a'.repeat(64) } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE — révocation', () => {
  it('révoque une invitation en attente, puis reste idempotent', async () => {
    await invite('a@b.fr');
    const inv = (store.tenant_invitations as any[])[0];

    const first = makeRes();
    await revokeHandler(
      req({ method: 'DELETE', query: { id: TENANT, invitationId: inv.id } }),
      first
    );
    expect(first.statusCode).toBe(200);
    expect((first.body as any).revoked).toBe(true);

    const second = makeRes();
    await revokeHandler(
      req({ method: 'DELETE', query: { id: TENANT, invitationId: inv.id } }),
      second
    );
    expect(second.statusCode).toBe(200);
    expect((second.body as any).revoked).toBe(false);
  });

  it('ne révoque pas l’invitation d’un autre espace', async () => {
    await invite('a@b.fr');
    const inv = (store.tenant_invitations as any[])[0];
    inv.tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    const res = makeRes();
    await revokeHandler(
      req({ method: 'DELETE', query: { id: TENANT, invitationId: inv.id } }),
      res
    );
    expect((res.body as any).revoked).toBe(false);
    expect(inv.revoked_at).toBeFalsy();
  });
});
