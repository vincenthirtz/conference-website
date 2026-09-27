// Découverte offerte via le numéro RNA — la seconde porte de la gratuité.
//
// Ce que ces tests protègent, dans l'ordre d'importance :
//
//   1. **Un silence ne vaut pas un refus.** L'Annuaire des Entreprises ne
//      connaît que les associations immatriculées à l'INSEE ; beaucoup de
//      petites associations ont un RNA valide sans SIREN. Si `not_found` ou
//      `unavailable` menaient à un refus, on écarterait exactement celles pour
//      qui la gratuité a été créée.
//   2. **Un numéro bien formé ne suffit pas.** Le RNA est PUBLIC : n'importe
//      qui peut recopier celui d'une vraie association. D'où la résolution
//      contre l'annuaire, et l'unicité par espace.
//   3. **Délier HelloAsso ne doit pas emporter une gratuité qu'il n'a pas
//      accordée.** C'est le piège introduit par l'existence d'une seconde
//      porte, et il serait silencieux : la gratuité disparaîtrait au milieu
//      d'une opération qui ne parle que d'encaissement.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { lookupRna } = vi.hoisted(() => ({
  lookupRna: vi.fn(),
}));
vi.mock('@/utils/billing/rna', async (importOriginal) => {
  // On ne simule QUE l'appel réseau : `parseRna` et `rnaVerdict` sont la règle,
  // et les remplacer reviendrait à tester le mock.
  const actual = await importOriginal<typeof import('@/utils/billing/rna')>();
  return { ...actual, lookupRna };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import { parseRna, rnaVerdict } from '../../utils/billing/rna';
import { helloassoUnlinkClearsGrant } from '../../utils/billing/nonprofitGrant';
import handler from '../../pages/api/admin/tenants/[id]/nonprofit-rna';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const STAFF_ID = 'staff-rna';

/* -----------------------------------------------------------
 * 1) La forme du numéro — pure, sans réseau
 * ---------------------------------------------------------*/

describe('parseRna', () => {
  it('accepte un numéro correct et le normalise', () => {
    expect(parseRna('W751074179')).toBe('W751074179');
    // Un numéro se recopie d'un récépissé de préfecture, souvent à la main :
    // espaces, tirets et minuscules ne sont pas des erreurs de l'utilisateur.
    expect(parseRna(' w75 107-4179 ')).toBe('W751074179');
  });

  it('refuse ce qui n’a pas la forme d’un RNA', () => {
    expect(parseRna('751074179')).toBeNull(); // pas de W
    expect(parseRna('W75107417')).toBeNull(); // 8 caractères
    expect(parseRna('W7510741790')).toBeNull(); // 10 caractères
    expect(parseRna('W75107417$')).toBeNull();
    expect(parseRna(null)).toBeNull();
    expect(parseRna(42)).toBeNull();
  });

  it('accepte une lettre dans le corps (numéros d’outre-mer)', () => {
    expect(parseRna('W9A1234567')).toBe('W9A1234567');
  });
});

/* -----------------------------------------------------------
 * 2) La décision — pure, sans réseau
 * ---------------------------------------------------------*/

describe('rnaVerdict', () => {
  it('estampille une association en activité', () => {
    expect(
      rnaVerdict({
        status: 'found',
        name: 'LES RESTAURANTS DU COEUR',
        active: true,
      })
    ).toEqual({ decision: 'verify', orgName: 'LES RESTAURANTS DU COEUR' });
  });

  it('refuse une structure qui n’est pas une association', () => {
    expect(rnaVerdict({ status: 'not_association', name: 'SARL X' })).toEqual({
      decision: 'reject',
      reason: 'not_association',
    });
  });

  it('attend — sans refuser — quand l’annuaire ne sait pas', () => {
    // Le cœur du lot : une association sans SIREN et un annuaire en panne se
    // ressemblent de l'extérieur, et dans les deux cas la bonne réponse est
    // « quelqu'un regarde », jamais « non ».
    expect(rnaVerdict({ status: 'not_found' }).decision).toBe('pending');
    expect(rnaVerdict({ status: 'unavailable' }).decision).toBe('pending');
    expect(
      rnaVerdict({ status: 'found', name: 'ASSO CESSÉE', active: false })
        .decision
    ).toBe('pending');
  });
});

/* -----------------------------------------------------------
 * 3) Délier HelloAsso ne retire que ce que HelloAsso a donné
 * ---------------------------------------------------------*/

describe('helloassoUnlinkClearsGrant', () => {
  it('retire une estampille HelloAsso, ou sans provenance connue', () => {
    expect(helloassoUnlinkClearsGrant('helloasso')).toBe(true);
    // Avant le suivi de provenance, la seule porte était HelloAsso.
    expect(helloassoUnlinkClearsGrant(null)).toBe(true);
    expect(helloassoUnlinkClearsGrant(undefined)).toBe(true);
  });

  it('CONSERVE une estampille obtenue par le RNA', () => {
    expect(helloassoUnlinkClearsGrant('rna')).toBe(false);
    expect(helloassoUnlinkClearsGrant('staff')).toBe(false);
  });
});

/* -----------------------------------------------------------
 * 4) La route
 * ---------------------------------------------------------*/

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'PUT',
    headers: { host: 'h', authorization: 'Bearer t' },
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

function tenantRow() {
  return (store.tenants as any[]).find((t) => t.id === TENANT);
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  lookupRna.mockReset();
  setAuthUser({ id: 'user-staff' });
  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: 'user-staff',
      email: 'staff@example.com',
      role: 'admin',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [
    {
      id: TENANT,
      slug: 'conf',
      name: 'Conf',
      is_active: true,
      plan: 'discovery',
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
  store.staff_logs = [];
});

describe('PUT /api/admin/tenants/[id]/nonprofit-rna', () => {
  it('estampille quand l’annuaire confirme une association vivante', async () => {
    lookupRna.mockResolvedValue({
      status: 'found',
      name: 'LES RESTAURANTS DU COEUR',
      active: true,
    });
    const res = makeRes();
    await handler(makeReq({ body: { rna: 'w751074179' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ rna: 'W751074179', verified: true });

    const t = tenantRow();
    expect(t.nonprofit_rna).toBe('W751074179');
    expect(t.nonprofit_verified_at).toBeTruthy();
    expect(t.nonprofit_verified_via).toBe('rna');
    // Le nom vient de l'annuaire, pas de la saisie : c'est le seul vérifié.
    expect(t.nonprofit_org_name).toBe('LES RESTAURANTS DU COEUR');
  });

  it('enregistre SANS estampiller quand l’annuaire ne trouve rien', async () => {
    lookupRna.mockResolvedValue({ status: 'not_found' });
    const res = makeRes();
    await handler(makeReq({ body: { rna: 'W123456789' } }), res);

    // Pas une erreur : une association sans SIREN est parfaitement légitime.
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      verified: false,
      pendingReason: 'not_in_directory',
    });

    const t = tenantRow();
    expect(t.nonprofit_rna).toBe('W123456789');
    expect(t.nonprofit_rna_declared_at).toBeTruthy();
    // …mais aucune gratuité tant que personne n'a regardé.
    expect(t.nonprofit_verified_at ?? null).toBeNull();
  });

  it('refuse un numéro qui ne désigne pas une association', async () => {
    lookupRna.mockResolvedValue({ status: 'not_association', name: 'SARL X' });
    const res = makeRes();
    await handler(makeReq({ body: { rna: 'W751074179' } }), res);

    expect(res.statusCode).toBe(422);
    expect((res.body as any).code).toBe('RNA_NOT_ASSOCIATION');
    // Rien n'est écrit : un refus ne laisse pas de déclaration derrière lui.
    expect(tenantRow().nonprofit_rna ?? null).toBeNull();
  });

  it('refuse une saisie mal formée sans appeler l’annuaire', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { rna: 'pas-un-rna' } }), res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('RNA_INVALID');
    expect(lookupRna).not.toHaveBeenCalled();
  });

  it('refuse un numéro déjà rattaché à un autre espace', async () => {
    // Le RNA est PUBLIC : sans cette garde, celui d'une vraie association
    // recopié depuis un annuaire en ligne multiplierait les paliers offerts.
    (store.tenants as any[]).push({
      id: OTHER_TENANT,
      slug: 'autre',
      name: 'Autre',
      is_active: true,
      nonprofit_rna: 'W751074179',
    });
    const res = makeRes();
    await handler(makeReq({ body: { rna: 'W751074179' } }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('RNA_ALREADY_USED');
    expect(lookupRna).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/tenants/[id]/nonprofit-rna', () => {
  it('retire le numéro ET la gratuité qu’il portait', async () => {
    Object.assign(tenantRow(), {
      nonprofit_rna: 'W751074179',
      nonprofit_rna_declared_at: '2026-09-27T00:00:00.000Z',
      nonprofit_verified_at: '2026-09-27T00:00:00.000Z',
      nonprofit_verified_via: 'rna',
      nonprofit_org_name: 'ASSO',
    });
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(200);
    const t = tenantRow();
    expect(t.nonprofit_rna).toBeNull();
    expect(t.nonprofit_verified_at).toBeNull();
    expect(t.nonprofit_verified_via).toBeNull();
  });

  it('CONSERVE une gratuité venue de HelloAsso', async () => {
    // Symétrique du garde-fou côté déliaison : effacer un numéro déclaré à
    // côté ne doit pas emporter une preuve qui n'en dépend pas.
    Object.assign(tenantRow(), {
      nonprofit_rna: 'W751074179',
      nonprofit_verified_at: '2026-09-16T00:00:00.000Z',
      nonprofit_verified_via: 'helloasso',
      nonprofit_org_name: 'ASSO HELLOASSO',
    });
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(200);
    const t = tenantRow();
    expect(t.nonprofit_rna).toBeNull();
    expect(t.nonprofit_verified_at).toBe('2026-09-16T00:00:00.000Z');
    expect(t.nonprofit_verified_via).toBe('helloasso');
  });
});
