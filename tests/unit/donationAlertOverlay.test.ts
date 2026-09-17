// Source OBS « alerte don » (`/overlay/don-alert`).
// Targets : utils/helloasso/donationEvent.ts (pur),
//           pages/api/helloasso/webhook.ts (branche don),
//           utils/overlay/donationsOverlay.ts (pur), pages/api/overlay/donations.ts,
//           utils/overlay/donAlert.ts (pur), components/overlay/match/DonationAlertSource.tsx
//
// CE QUE CES CAS PROTÈGENT :
//   1. SEUL UN DON EST ANNONCÉ : ni adhésion, ni abonnement de plan, ni
//      cagnotte — « merci pour ce don » sur une cotisation serait faux.
//   2. JAMAIS LE DONATEUR : la ligne stockée ne porte ni nom ni email.
//   3. UN REJEU HELLOASSO NE COMPTE PAS DEUX FOIS.
//   4. PAS DE RAFALE À L'OUVERTURE DE LA SOURCE : le premier chargement est
//      « déjà vu », les alertes suivantes passent une par une.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import type { HelloAssoWebhookEvent } from '../../utils/helloasso';
import {
  buildDonationRow,
  classifyDonation,
  type DonationContext,
} from '../../utils/helloasso/donationEvent';
import {
  parseDonationAfter,
  selectRecentDonations,
  sumDonationsSince,
} from '../../utils/overlay/donationsOverlay';
import {
  ALERT_MAX_AGE_MS,
  demoDonation,
  demoTotalCents,
  formatEuros,
  gaugeRatio,
  ingestDonations,
  initialQueueState,
  parseAlertDurationMs,
  parseGoalCents,
  shiftQueue,
  type DonAlertDonation,
} from '../../utils/overlay/donAlert';
import webhookHandler from '../../pages/api/helloasso/webhook';
import donationsHandler from '../../pages/api/overlay/donations';
import { DonationGauge } from '../../components/overlay/match/DonationAlertSource';

const OTHER_TENANT = '99999999-0000-4000-8000-000000000009';
const PLAN_TENANT = '11111111-1111-4111-8111-111111111111';
const POOL = '33333333-3333-4333-8333-333333333333';
const NOW_DEMO = Date.parse('2026-09-17T19:00:00.000Z');

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined,
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
  };
}

function payment(
  over: Partial<HelloAssoWebhookEvent['data']> = {},
  root: Partial<HelloAssoWebhookEvent> = {}
): HelloAssoWebhookEvent {
  return {
    eventType: 'Payment',
    ...root,
    data: {
      id: 7001,
      amount: 2000,
      state: 'Authorized',
      payer: { firstName: 'Camille', lastName: 'Martin', email: 'c@m.fr' },
      order: { id: 1, formType: 'Donation', formSlug: 'soutenir-la-coupe' },
      items: [{ name: 'Don', amount: 2000, type: 'Donation' }] as never,
      ...over,
    },
  };
}

const PLATFORM: DonationContext = {
  source: 'platform',
  planCorrelated: false,
  prizeCorrelated: false,
};

/* ===========================================================================
 * Classification
 * =========================================================================*/

describe('classifyDonation', () => {
  it('formulaire Donation → don', () => {
    const c = classifyDonation(payment(), PLATFORM);
    expect(c.isDonation).toBe(true);
    expect(c.formType).toBe('Donation');
    expect(c.formSlug).toBe('soutenir-la-coupe');
  });

  it('formulaire Donation sur le compte d’un espace tiers → don', () => {
    const c = classifyDonation(payment(), { ...PLATFORM, source: 'tenant' });
    expect(c.isDonation).toBe(true);
  });

  it('formulaire absent mais item de type Donation → don', () => {
    const c = classifyDonation(payment({ order: undefined }), PLATFORM);
    expect(c).toMatchObject({ isDonation: true, formType: null });
  });

  it('checkout de la page /don (non corrélé, compte association) → don', () => {
    const c = classifyDonation(
      payment({
        order: { id: 2, formType: 'Checkout', formSlug: 'checkout' },
        items: [{ name: "Don pour l'association", amount: 2000 }],
      }),
      PLATFORM
    );
    expect(c.isDonation).toBe(true);
  });

  it('checkout reçu d’un espace tiers → pas un don (ce n’est pas notre /don)', () => {
    const c = classifyDonation(
      payment({ order: { formType: 'Checkout' }, items: [] }),
      { ...PLATFORM, source: 'tenant' }
    );
    expect(c).toMatchObject({ isDonation: false, reason: 'foreign_checkout' });
  });

  it('adhésion → pas un don, même avec un don en option', () => {
    const c = classifyDonation(
      payment({
        order: { formType: 'Membership', formSlug: 'adhesion-2026-2027' },
        items: [
          { name: 'Adhésion', amount: 1000, type: 'Membership' },
          { name: 'Don', amount: 500, type: 'Donation' },
        ] as never,
      }),
      PLATFORM
    );
    expect(c).toMatchObject({ isDonation: false, reason: 'non_donation_form' });
  });

  it('billetterie et boutique → pas des dons', () => {
    for (const formType of ['Event', 'Shop']) {
      expect(
        classifyDonation(payment({ order: { formType } }), PLATFORM).isDonation
      ).toBe(false);
    }
  });

  it('abonnement de plan (metadata ou corrélation) → pas un don', () => {
    const checkout = { order: { formType: 'Checkout' } };
    expect(
      classifyDonation(
        payment({
          ...checkout,
          metadata: { kind: 'tenant_plan', tenant_id: PLAN_TENANT },
        }),
        PLATFORM
      )
    ).toMatchObject({ isDonation: false, reason: 'plan_payment' });
    expect(
      classifyDonation(payment(checkout), {
        ...PLATFORM,
        planCorrelated: true,
      })
    ).toMatchObject({ isDonation: false, reason: 'plan_payment' });
  });

  it('contribution de cagnotte (même avec un item Donation) → pas un don', () => {
    expect(
      classifyDonation(
        payment({ order: undefined }, { metadata: { kind: 'prize_pool' } }),
        PLATFORM
      )
    ).toMatchObject({ isDonation: false, reason: 'prize_contribution' });
    expect(
      classifyDonation(payment({ order: { formType: 'Checkout' } }), {
        ...PLATFORM,
        prizeCorrelated: true,
      })
    ).toMatchObject({ isDonation: false, reason: 'prize_contribution' });
  });

  it('checkout dont la corrélation a échoué → pas un don (prudence)', () => {
    const c = classifyDonation(payment({ order: { formType: 'Checkout' } }), {
      ...PLATFORM,
      planCorrelated: null,
    });
    expect(c).toMatchObject({
      isDonation: false,
      reason: 'correlation_unknown',
    });
  });

  it('champs manquants ou invalides → pas un don', () => {
    expect(
      classifyDonation(
        payment({ order: undefined, items: undefined }),
        PLATFORM
      )
    ).toMatchObject({ isDonation: false, reason: 'no_donation_item' });
    expect(
      classifyDonation(payment({ state: 'Refused' }), PLATFORM).isDonation
    ).toBe(false);
    expect(
      classifyDonation(payment({}, { eventType: 'Order' }), PLATFORM).isDonation
    ).toBe(false);
    expect(classifyDonation(payment({ amount: 0 }), PLATFORM).isDonation).toBe(
      false
    );
    expect(
      classifyDonation(payment({ amount: 12.5 }), PLATFORM).isDonation
    ).toBe(false);
    expect(
      classifyDonation(payment({ id: undefined as never }), PLATFORM).isDonation
    ).toBe(false);
    expect(
      classifyDonation({ eventType: 'Payment' } as never, PLATFORM).isDonation
    ).toBe(false);
  });

  it('la ligne ne porte que montant, devise et formulaire', () => {
    const event = payment();
    const row = buildDonationRow(
      event,
      DEFAULT_TENANT_ID,
      classifyDonation(event, PLATFORM)
    );
    expect(row).toEqual({
      tenant_id: DEFAULT_TENANT_ID,
      helloasso_payment_id: '7001',
      amount_cents: 2000,
      currency: 'EUR',
      form_type: 'Donation',
      form_slug: 'soutenir-la-coupe',
    });
    expect(JSON.stringify(row)).not.toMatch(/Camille|Martin|c@m\.fr/);
  });
});

/* ===========================================================================
 * Webhook
 * =========================================================================*/

describe('/api/helloasso/webhook — alerte don', () => {
  const ORIG_SECRET = process.env.HELLOASSO_WEBHOOK_SECRET;
  beforeEach(() => {
    resetSupabaseMock();
    process.env.HELLOASSO_WEBHOOK_SECRET = 'right-secret';
  });
  afterEach(() => {
    if (ORIG_SECRET === undefined) delete process.env.HELLOASSO_WEBHOOK_SECRET;
    else process.env.HELLOASSO_WEBHOOK_SECRET = ORIG_SECRET;
  });

  function webhookReq(body: unknown): any {
    return {
      method: 'POST',
      headers: { host: 'h' },
      query: { token: 'right-secret' },
      body,
      socket: { remoteAddress: '127.0.0.1' },
    };
  }

  it('enregistre un don une seule fois, sans le donateur', async () => {
    for (let i = 0; i < 2; i += 1) {
      const res = makeRes();
      await webhookHandler(webhookReq(payment()), res);
      expect(res.statusCode).toBe(200);
    }
    const rows = store.helloasso_donations ?? [];
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'amount_cents',
      'currency',
      'form_slug',
      'form_type',
      'helloasso_payment_id',
      'tenant_id',
    ]);
    expect(rows[0]).toMatchObject({
      tenant_id: DEFAULT_TENANT_ID,
      helloasso_payment_id: '7001',
      amount_cents: 2000,
    });
  });

  it('n’enregistre pas une adhésion', async () => {
    const res = makeRes();
    await webhookHandler(
      webhookReq(
        payment({
          order: { formType: 'Membership', formSlug: 'adhesion' },
          items: [
            { name: 'Adhésion', amount: 2000, type: 'Membership' },
          ] as never,
        })
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.helloasso_donations ?? []).toHaveLength(0);
  });

  it('n’enregistre pas une contribution de cagnotte', async () => {
    store.tournament_prize_pools = [
      {
        id: POOL,
        tournament_id: '22222222-2222-4222-8222-222222222222',
        tenant_id: DEFAULT_TENANT_ID,
        currency: 'EUR',
        goal_amount_cents: null,
        base_amount_cents: 0,
        raised_amount_cents: 0,
        is_open: true,
      },
    ];
    const res = makeRes();
    await webhookHandler(
      webhookReq(
        payment({
          id: 7002,
          order: { formType: 'Checkout' },
          metadata: {
            kind: 'prize_pool',
            prize_pool_id: POOL,
            tenant_id: DEFAULT_TENANT_ID,
          },
        })
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.helloasso_donations ?? []).toHaveLength(0);
  });

  it('une erreur d’écriture ne casse pas l’ACK 200', async () => {
    const { supabaseAdmin } = await import('./__helpers__/supabaseMock');
    const spy = vi.spyOn(supabaseAdmin, 'from').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      const res = makeRes();
      await webhookHandler(webhookReq(payment({ id: 7003 })), res);
      expect(res.statusCode).toBe(200);
    } finally {
      spy.mockRestore();
    }
  });
});

/* ===========================================================================
 * API publique
 * =========================================================================*/

describe('GET /api/overlay/donations', () => {
  const NOW = Date.parse('2026-09-17T19:00:00.000Z'); // 21:00 à Paris
  const HOUR = 3600 * 1000;
  const ID = (n: number) =>
    `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`;

  function donation(
    n: number,
    agoMs: number,
    amount = 1000,
    tenant = DEFAULT_TENANT_ID
  ) {
    return {
      id: ID(n),
      tenant_id: tenant,
      helloasso_payment_id: String(n),
      amount_cents: amount,
      currency: 'EUR',
      form_type: 'Donation',
      form_slug: 'don',
      created_at: new Date(NOW - agoMs).toISOString(),
    };
  }

  function req(query: Record<string, string> = {}): any {
    return {
      method: 'GET',
      headers: { host: 'h' },
      query,
      socket: { remoteAddress: '10.0.0.2' },
    };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetSupabaseMock();
    store.helloasso_donations = [
      donation(1, 1 * HOUR, 1000), // aujourd'hui (20:00 Paris)
      donation(2, 10 * HOUR, 2500), // aujourd'hui (11:00 Paris)
      donation(3, 22 * HOUR, 500), // hier soir 23:00 Paris, < 24 h
      donation(4, 30 * HOUR, 4000), // hier, > 24 h
      donation(5, 1 * HOUR, 9999, OTHER_TENANT), // autre espace
    ];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rend les dons des dernières 24 h et le total du jour', async () => {
    const res = makeRes();
    await donationsHandler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.donations.map((d: { id: string }) => d.id)).toEqual([
      ID(1),
      ID(2),
      ID(3),
    ]);
    expect(Object.keys(res.body.donations[0]).sort()).toEqual([
      'amountCents',
      'createdAt',
      'currency',
      'id',
    ]);
    expect(res.body.totalCents).toBe(3500);
    expect(res.body.count).toBe(2);
    expect(res.body.from).toBe('2026-09-17');
    expect(res.headers['Cache-Control']).toBe(
      'public, s-maxage=5, stale-while-revalidate=15'
    );
  });

  it('compte le total depuis `from`', async () => {
    const res = makeRes();
    await donationsHandler(req({ from: '2026-09-16' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.totalCents).toBe(8000);
    expect(res.body.count).toBe(4);
    // La liste reste bornée à 24 h.
    expect(res.body.donations).toHaveLength(3);
  });

  it('filtre après un don déjà vu', async () => {
    const res = makeRes();
    await donationsHandler(req({ after: ID(2) }), res);
    expect(res.body.donations.map((d: { id: string }) => d.id)).toEqual([
      ID(1),
    ]);
  });

  it('refuse un `from` ou un `after` illisible', async () => {
    const cases: Record<string, string>[] = [
      { from: 'hier' },
      { from: '2026-02-31' },
      { after: 'x' },
    ];
    for (const query of cases) {
      const res = makeRes();
      await donationsHandler(req(query), res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('402 quand l’espace n’a pas les sources de stream', async () => {
    store.tenants = [
      {
        id: OTHER_TENANT,
        slug: 'autre',
        plan: 'discovery',
        plan_status: 'active',
        plan_expires_at: null,
      },
    ];
    const res = makeRes();
    await donationsHandler(req({ tenant: 'autre' }), res);
    expect(res.statusCode).toBe(402);
    expect(res.body.capability).toBe('matchOverlays');
  });
});

describe('donationsOverlay (pur)', () => {
  const NOW = Date.parse('2026-09-17T19:00:00.000Z');
  it('parse `after`', () => {
    expect(parseDonationAfter(undefined)).toEqual({ kind: 'none' });
    expect(parseDonationAfter('2026-09-17T18:00:00Z')).toEqual({
      kind: 'time',
      ms: Date.parse('2026-09-17T18:00:00Z'),
    });
    expect(parseDonationAfter('2026-09-17')).toBeNull();
  });

  it('coupe la liste à 20, plus récents d’abord', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      id: `id-${String(i).padStart(2, '0')}`,
      amount_cents: 100,
      currency: 'EUR',
      created_at: new Date(NOW - i * 60_000).toISOString(),
    }));
    const out = selectRecentDonations(rows, NOW);
    expect(out).toHaveLength(20);
    expect(out[0]!.id).toBe('id-00');
  });

  it('ignore les montants invalides dans le total', () => {
    expect(
      sumDonationsSince(
        [
          { amount_cents: 500, created_at: new Date(NOW).toISOString() },
          { amount_cents: -1, created_at: new Date(NOW).toISOString() },
          { amount_cents: 700, created_at: 'n/a' },
        ],
        NOW - 1
      )
    ).toEqual({ totalCents: 500, count: 1 });
  });
});

/* ===========================================================================
 * Source OBS : file, formats, paramètres
 * =========================================================================*/

describe('file d’alertes', () => {
  const NOW = Date.parse('2026-09-17T19:00:00.000Z');
  const d = (id: string, agoMs = 0, amountCents = 1000): DonAlertDonation => ({
    id,
    amountCents,
    createdAt: new Date(NOW - agoMs).toISOString(),
  });
  const feed = (donations: DonAlertDonation[]) => ({
    donations,
    serverTime: new Date(NOW).toISOString(),
  });

  it('le premier chargement ne déclenche aucune alerte', () => {
    const s = ingestDonations(initialQueueState(), feed([d('a'), d('b')]));
    expect(s.primed).toBe(true);
    expect(s.queue).toEqual([]);
    expect(s.seen).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('un premier chargement vide amorce quand même', () => {
    const s = ingestDonations(initialQueueState(), feed([]));
    expect(s.primed).toBe(true);
    const next = ingestDonations(s, feed([d('new')]));
    expect(next.queue.map((x) => x.id)).toEqual(['new']);
  });

  it('les nouveaux dons passent un par un, du plus ancien au plus récent', () => {
    let s = ingestDonations(initialQueueState(), feed([d('old', 60_000)]));
    s = ingestDonations(
      s,
      feed([d('n2', 1000), d('n1', 2000), d('old', 60_000)])
    );
    expect(s.queue.map((x) => x.id)).toEqual(['n1', 'n2']);
    // Rejouer la même réponse n'ajoute rien (et garde la référence).
    expect(ingestDonations(s, feed([d('n2', 1000), d('n1', 2000)]))).toBe(s);

    const first = shiftQueue(s);
    expect(first.next?.id).toBe('n1');
    const second = shiftQueue(first.state);
    expect(second.next?.id).toBe('n2');
    expect(shiftQueue(second.state).next).toBeNull();
  });

  it('un don découvert trop tard est marqué vu sans alerte', () => {
    let s = ingestDonations(initialQueueState(), feed([]));
    s = ingestDonations(s, feed([d('late', ALERT_MAX_AGE_MS + 1000)]));
    expect(s.queue).toEqual([]);
    expect(s.seen).toContain('late');
  });
});

describe('formats et paramètres', () => {
  const norm = (s: string) => s.replace(/[  ]/g, ' ');

  it('formate les euros à la française', () => {
    expect(norm(formatEuros(1000))).toBe('10 €');
    expect(norm(formatEuros(1250))).toBe('12,50 €');
    expect(norm(formatEuros(123456))).toBe('1 234,56 €');
    expect(norm(formatEuros(-5))).toBe('0 €');
  });

  it('lit l’objectif en euros', () => {
    expect(parseGoalCents('500')).toBe(50000);
    expect(parseGoalCents('12,5')).toBe(1250);
    expect(parseGoalCents('0')).toBeNull();
    expect(parseGoalCents('1000001')).toBeNull();
    expect(parseGoalCents('abc')).toBeNull();
    expect(parseGoalCents(undefined)).toBeNull();
  });

  it('borne la durée d’une alerte', () => {
    expect(parseAlertDurationMs(undefined)).toBe(8000);
    expect(parseAlertDurationMs('1')).toBe(3000);
    expect(parseAlertDurationMs('90')).toBe(30000);
    expect(parseAlertDurationMs('12')).toBe(12000);
  });

  it('borne la jauge', () => {
    expect(gaugeRatio(25000, 50000)).toBe(0.5);
    expect(gaugeRatio(90000, 50000)).toBe(1);
    expect(gaugeRatio(100, 0)).toBe(0);
  });

  it('la démo est marquée et fait bouger la jauge', () => {
    expect(demoDonation(0, NOW_DEMO).id).toBe('demo-0');
    expect(demoTotalCents(0, 5000)).toBe(0);
    expect(demoTotalCents(2, 5000)).toBe(1500);
    // Dépasse l'objectif → repart de zéro.
    expect(demoTotalCents(4, 5000)).toBeLessThanOrEqual(5000);
  });

  it('la jauge affiche « total / objectif »', () => {
    const html = norm(
      renderToStaticMarkup(
        createElement(DonationGauge, {
          totalCents: 12300,
          goalCents: 50000,
          accent: '#ffcc00',
        })
      )
    );
    expect(html).toContain('123 € / 500 €');
    expect(html).toContain('aria-valuenow="25"');
  });
});
