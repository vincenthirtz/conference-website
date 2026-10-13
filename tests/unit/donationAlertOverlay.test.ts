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

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

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
import { DonationGauge } from '../../components/overlay/match/DonationAlertSource';

const NOW_DEMO = Date.parse('2026-09-17T19:00:00.000Z');

/* ===========================================================================
 * Classification
 * =========================================================================*/

/* ===========================================================================
 * Webhook
 * =========================================================================*/

/* ===========================================================================
 * API publique
 * =========================================================================*/

/* ===========================================================================
 * Source OBS : file, formats, paramètres
 * =========================================================================*/

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
