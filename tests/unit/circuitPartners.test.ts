// Offre partenaire des circuits féminins et mixtes.
// Targets : pages/api/circuit-partners/apply.ts,
//           utils/billing/circuitPartnerGrant.ts,
//           pages/api/admin/circuit-partners/{index,[id]}.ts,
//           getStaticProps des pages /organisateurs/*.
//
// CE QUE CES CAS PROTÈGENT, par ordre d'importance :
//   1. ACCORDER NE RÉTROGRADE JAMAIS un espace déjà mieux couvert (Fondation,
//      Éditeur, ou le plan offert jusqu'à plus tard) — offrir un plan ne doit
//      pas coûter des mois à quelqu'un qui a payé.
//   2. PAS D'ACCORD TRACÉ SANS PLAN POSÉ : si l'espace ne peut pas être mis à
//      jour, la candidature revient à son statut.
//   3. UNE SEULE DÉCISION : une candidature accordée ne se re-décide pas.
//   4. PORTÉE PLATEFORME : un admin (non owner de la plateforme) ne lit ni
//      n'accorde rien.
//   5. LES PAGES N'ANNONCENT QUE CE QUE LE CODE FAIT : lignes d'offre et palier
//      d'arbitrage dérivés du barème, jeux du registre.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/utils/captcha', () => ({
  verifyCaptcha: vi.fn(() => ({ valid: true })),
}));
vi.mock('@/utils/email', () => ({
  sendCircuitPartnerStaffEmail: vi.fn(async () => ({ success: true })),
  sendCircuitPartnerConfirmationEmail: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setTableWriteError,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import applyHandler from '../../pages/api/circuit-partners/apply';
import listHandler from '../../pages/api/admin/circuit-partners/index';
import decideHandler from '../../pages/api/admin/circuit-partners/[id]';
import {
  grantCircuitPartnerOffer,
  offerWouldDowngrade,
} from '../../utils/billing/circuitPartnerGrant';
import {
  CIRCUIT_PARTNER_OFFER,
  circuitOfferExpiry,
} from '../../config/circuitPartnerOffer';
import { getPlanFeatures, PLAN_LABELS } from '../../utils/billing/planFeatures';
import { GAME_SLUGS } from '../../config/games';
import { getStaticProps as guideProps } from '../../pages/organisateurs/tournoi-feminin-ou-mixte';
import { getStaticProps as circuitsProps } from '../../pages/organisateurs/circuits-feminins';
import { circuitPartnerApplicationBodySchema } from '../../lib/apiContracts/public/circuitPartners';

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001';
const APP = 'bbbbbbbb-0000-4000-8000-000000000002';
const STAFF_OWNER = 'cccccccc-0000-4000-8000-000000000003';
const STAFF_ADMIN = 'dddddddd-0000-4000-8000-000000000004';
const NOW = Date.parse('2026-09-16T10:00:00.000Z');

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: 'Bearer t-owner' },
    cookies: { staff_active_tenant_id: TENANT },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const validBody = () => ({
  organizationName: 'Ligue Valo Féminine',
  contactName: 'Ana',
  email: 'ana@ligue-valo.fr',
  game: 'valorant',
  format: 'feminin',
  expectedTeams: 12,
  website: '',
  communityUrl: 'https://discord.gg/ligue',
  existingSpaceSlug: 'ligue-valo',
  message: 'Une saison de huit journées, douze équipes, diffusée sur Twitch.',
  commitsCodeOfConduct: true,
  commitsSafetyLead: true,
  honeypot: '',
  captchaToken: 'tok',
  captchaAnswer: '4',
});

function tenant(over: Record<string, unknown> = {}) {
  return {
    id: TENANT,
    slug: 'ligue-valo',
    name: 'Ligue Valo',
    is_active: true,
    plan: 'regie',
    plan_status: 'active',
    plan_is_trial: true,
    plan_started_at: '2026-09-01T00:00:00.000Z',
    plan_expires_at: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

function application(over: Record<string, unknown> = {}) {
  return {
    id: APP,
    created_at: '2026-09-15T10:00:00.000Z',
    organization_name: 'Ligue Valo Féminine',
    contact_name: 'Ana',
    email: 'ana@ligue-valo.fr',
    game: 'valorant',
    format: 'feminin',
    existing_tenant_slug: 'ligue-valo',
    message: 'Une saison de huit journées.',
    commits_code_of_conduct: true,
    commits_safety_lead: true,
    status: 'new',
    admin_notes: null,
    granted_tenant_id: null,
    granted_plan: null,
    granted_until: null,
    ...over,
  };
}

const apps = () => (store.circuit_partner_applications ?? []) as any[];

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-owner' });
  store.staff = [
    {
      id: STAFF_OWNER,
      auth_user_id: 'user-owner',
      email: 'owner@example.com',
      role: 'owner',
      is_pole_admin: false,
    },
    {
      id: STAFF_ADMIN,
      auth_user_id: 'user-admin',
      email: 'admin@example.com',
      role: 'admin',
      is_pole_admin: false,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ADMIN, role: 'owner' },
  ] as any;
  store.tenants = [tenant()] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/circuit-partners/apply', () => {
  it('enregistre une candidature complète, sans rien accorder', async () => {
    const res = makeRes();
    await applyHandler(makeReq({ body: validBody() }), res);
    expect(res.statusCode).toBe(201);
    expect(apps()).toHaveLength(1);
    expect(apps()[0]).toMatchObject({
      organization_name: 'Ligue Valo Féminine',
      game: 'valorant',
      format: 'feminin',
      status: 'new',
      website: null,
      existing_tenant_slug: 'ligue-valo',
      commits_code_of_conduct: true,
    });
    // Rien n'est posé sur l'espace : candidater n'est pas obtenir.
    expect((store.tenants as any[])[0].plan).toBe('regie');
  });

  it('refuse un jeu hors du registre', async () => {
    const res = makeRes();
    await applyHandler(
      makeReq({ body: { ...validBody(), game: 'tetris' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_GAME');
    expect(apps()).toHaveLength(0);
  });

  it('exige les deux engagements de sécurité', async () => {
    const res = makeRes();
    await applyHandler(
      makeReq({ body: { ...validBody(), commitsSafetyLead: false } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(apps()).toHaveLength(0);
  });

  it('honeypot rempli : succès générique, rien d’écrit', async () => {
    const res = makeRes();
    await applyHandler(
      makeReq({ body: { ...validBody(), honeypot: 'bot' } }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(apps()).toHaveLength(0);
  });

  it('n’écrit que des colonnes du schéma de la migration', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../database/migrations/circuit_partner_applications.sql'
      ),
      'utf8'
    );
    const handler = readFileSync(
      resolve(__dirname, '../../pages/api/circuit-partners/apply.ts'),
      'utf8'
    );
    const insert = handler.slice(handler.indexOf('.insert({'));
    const columns = [
      ...insert.slice(0, insert.indexOf('})')).matchAll(/^\s+([a-z_]+):/gm),
    ].map((m) => m[1]);
    expect(columns.length).toBeGreaterThan(10);
    for (const column of columns) {
      expect(sql, column).toMatch(new RegExp(`\\n\\s+${column} `));
    }
  });
});

describe('grantCircuitPartnerOffer', () => {
  beforeEach(() => {
    store.circuit_partner_applications = [application()] as any;
  });

  it('pose le plan offert sur l’espace et trace l’accord', async () => {
    const result = await grantCircuitPartnerOffer({
      applicationId: APP,
      tenantSlug: 'ligue-valo',
      staffId: STAFF_OWNER,
      nowMs: NOW,
    });
    expect(result).toMatchObject({
      ok: true,
      plan: CIRCUIT_PARTNER_OFFER.plan,
      grantedUntil: circuitOfferExpiry(NOW),
    });
    expect((store.tenants as any[])[0]).toMatchObject({
      plan: CIRCUIT_PARTNER_OFFER.plan,
      plan_status: 'active',
      plan_is_trial: false,
      plan_expires_at: circuitOfferExpiry(NOW),
      plan_last_reminder_at: null,
    });
    expect(apps()[0]).toMatchObject({
      status: 'approved',
      granted_tenant_id: TENANT,
      granted_plan: CIRCUIT_PARTNER_OFFER.plan,
      decided_by: STAFF_OWNER,
    });
  });

  it('ne rétrograde ni Fondation, ni Éditeur, ni une échéance plus lointaine', () => {
    const expiry = circuitOfferExpiry(NOW);
    expect(
      offerWouldDowngrade(tenant({ plan: 'foundation' }) as any, expiry)
    ).toBe(true);
    expect(offerWouldDowngrade(tenant({ plan: 'editor' }) as any, expiry)).toBe(
      true
    );
    expect(
      offerWouldDowngrade(
        tenant({
          plan: CIRCUIT_PARTNER_OFFER.plan,
          plan_expires_at: '2030-01-01T00:00:00.000Z',
        }) as any,
        expiry
      )
    ).toBe(true);
    // Un essai Régie, un espace gratuit : l'offre est un gain.
    expect(offerWouldDowngrade(tenant() as any, expiry)).toBe(false);
    expect(
      offerWouldDowngrade(tenant({ plan: 'discovery' }) as any, expiry)
    ).toBe(false);
  });

  it('refuse sans rien écrire quand l’espace est déjà mieux couvert', async () => {
    store.tenants = [tenant({ plan: 'editor' })] as any;
    const result = await grantCircuitPartnerOffer({
      applicationId: APP,
      tenantSlug: 'ligue-valo',
      staffId: STAFF_OWNER,
      nowMs: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'plan_already_covers' });
    expect((store.tenants as any[])[0].plan).toBe('editor');
    expect(apps()[0].status).toBe('new');
  });

  it('remet la candidature dans son statut si le plan ne peut pas être posé', async () => {
    setTableWriteError('tenants', { message: 'boom' });
    const result = await grantCircuitPartnerOffer({
      applicationId: APP,
      tenantSlug: 'ligue-valo',
      staffId: STAFF_OWNER,
      nowMs: NOW,
    });
    expect(result.ok).toBe(false);
    expect(apps()[0].status).toBe('new');
    expect(apps()[0].granted_tenant_id).toBeNull();
  });

  it('une candidature déjà tranchée ne se re-décide pas', async () => {
    store.circuit_partner_applications = [
      application({ status: 'rejected' }),
    ] as any;
    const result = await grantCircuitPartnerOffer({
      applicationId: APP,
      tenantSlug: 'ligue-valo',
      staffId: STAFF_OWNER,
      nowMs: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'already_decided' });
  });

  it('refuse un espace inconnu ou inactif', async () => {
    store.tenants = [tenant({ is_active: false })] as any;
    const result = await grantCircuitPartnerOffer({
      applicationId: APP,
      tenantSlug: 'ligue-valo',
      staffId: STAFF_OWNER,
      nowMs: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'tenant_not_found' });
  });
});

describe('routes admin', () => {
  beforeEach(() => {
    store.circuit_partner_applications = [application()] as any;
  });

  it('liste les candidatures avec le compte par statut (owner plateforme)', async () => {
    const res = makeRes();
    await listHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.counts).toMatchObject({ new: 1, approved: 0 });
    // L'IP ne sort pas.
    expect(res.body.items[0]).not.toHaveProperty('ip_address');
  });

  it('un propriétaire d’espace tiers (admin plateforme) est refusé', async () => {
    setAuthUser({ id: 'user-admin' });
    const res = makeRes();
    await listHandler(
      makeReq({
        method: 'GET',
        headers: { host: 'h', authorization: 'Bearer t-admin' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('accorde l’offre et journalise', async () => {
    const res = makeRes();
    await decideHandler(
      makeReq({
        method: 'PATCH',
        query: { id: APP },
        body: { action: 'approve', tenantSlug: 'ligue-valo' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe(CIRCUIT_PARTNER_OFFER.plan);
    const log = ((store.staff_logs ?? []) as any[]).find(
      (row) => row.action === 'approve_circuit_partner'
    );
    expect(log?.entity_id).toBe(TENANT);
  });

  it('un refus exige un motif', async () => {
    const res = makeRes();
    await decideHandler(
      makeReq({
        method: 'PATCH',
        query: { id: APP },
        body: { action: 'reject' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(apps()[0].status).toBe('new');
  });

  it('une candidature accordée ne repasse pas en refus', async () => {
    store.circuit_partner_applications = [
      application({ status: 'approved' }),
    ] as any;
    const res = makeRes();
    await decideHandler(
      makeReq({
        method: 'PATCH',
        query: { id: APP },
        body: { action: 'reject', notes: 'Changement d’avis' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(apps()[0].status).toBe('approved');
  });
});

describe('les pages n’annoncent que ce que le code fait', () => {
  it('guide : les jeux du registre et le premier palier qui ouvre l’arbitrage', async () => {
    const result = (await guideProps({} as any)) as any;
    expect(result.props.games.map((g: any) => g.slug)).toEqual([...GAME_SLUGS]);
    const sold = ['discovery', 'regie', 'circuit', 'editor'] as const;
    const first = sold.find((plan) => getPlanFeatures(plan).arbitration);
    expect(result.props.arbitrationPlan).toBe(PLAN_LABELS[first!]);
  });

  it('offre circuits : une ligne par capacité réellement ouverte par le plan', async () => {
    const result = (await circuitsProps({} as any)) as any;
    const f = getPlanFeatures(CIRCUIT_PARTNER_OFFER.plan);
    expect(result.props.months).toBe(CIRCUIT_PARTNER_OFFER.months);
    expect(result.props.offerLines.includes('offerBot')).toBe(f.discordBot);
    expect(result.props.offerLines.includes('offerApi')).toBe(
      f.apiRead && f.apiWrite
    );
    expect(result.props.offerLines.includes('offerBrand')).toBe(f.whiteLabel);
  });

  it('le contrat refuse une candidature sans engagement', () => {
    const body = { ...validBody(), commitsCodeOfConduct: false };
    expect(circuitPartnerApplicationBodySchema.safeParse(body).success).toBe(
      false
    );
  });
});
