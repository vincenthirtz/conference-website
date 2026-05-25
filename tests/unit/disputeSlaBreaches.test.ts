import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  ageInMinutes,
  classifyAge,
  listOpenDisputes,
  findUnpingedBreaches,
  markEscalationPinged,
  getSlaMinutes,
} from '../../utils/disputes/slaBreaches';

const TENANT_ID = 'tn-1';
const NOW_ISO = '2026-05-25T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);

beforeEach(() => {
  resetSupabaseMock();
  store.tenants = [{ id: TENANT_ID, dispute_sla_minutes: 60 }] as any;
});

/* -----------------------------------------------------------
 * Pure helpers
 * ---------------------------------------------------------*/

describe('ageInMinutes', () => {
  it('returns null on null/invalid', () => {
    expect(ageInMinutes(null)).toBeNull();
    expect(ageInMinutes('not-a-date')).toBeNull();
  });

  it('computes minute diff floored', () => {
    expect(ageInMinutes('2026-05-25T11:30:00.000Z', NOW_MS)).toBe(30);
    expect(ageInMinutes('2026-05-25T11:59:30.000Z', NOW_MS)).toBe(0);
    expect(ageInMinutes('2026-05-25T09:00:00.000Z', NOW_MS)).toBe(180);
  });
});

describe('classifyAge', () => {
  it('null age → fresh', () => {
    expect(classifyAge(null, 60)).toBe('fresh');
  });

  it('age >= sla → breached', () => {
    expect(classifyAge(60, 60)).toBe('breached');
    expect(classifyAge(120, 60)).toBe('breached');
  });

  it('0.75*sla <= age < sla → approaching', () => {
    expect(classifyAge(45, 60)).toBe('approaching'); // 75%
    expect(classifyAge(59, 60)).toBe('approaching');
  });

  it('age < 0.75*sla → fresh', () => {
    expect(classifyAge(44, 60)).toBe('fresh');
    expect(classifyAge(0, 60)).toBe('fresh');
  });
});

/* -----------------------------------------------------------
 * DB helpers
 * ---------------------------------------------------------*/

describe('getSlaMinutes', () => {
  it('reads dispute_sla_minutes from tenants', async () => {
    store.tenants = [{ id: TENANT_ID, dispute_sla_minutes: 90 }] as any;
    expect(await getSlaMinutes(TENANT_ID)).toBe(90);
  });

  it('falls back to 60 when tenant row is missing', async () => {
    store.tenants = [];
    expect(await getSlaMinutes(TENANT_ID)).toBe(60);
  });

  it('falls back to 60 when value is non-positive', async () => {
    store.tenants = [{ id: TENANT_ID, dispute_sla_minutes: 0 }] as any;
    expect(await getSlaMinutes(TENANT_ID)).toBe(60);
  });
});

describe('listOpenDisputes', () => {
  it('returns rows with classification + age', async () => {
    store.matches = [
      {
        id: 'm-old',
        tenant_id: TENANT_ID,
        status: 'disputed',
        team1_id: 'tA',
        team2_id: 'tB',
        dispute_opened_at: '2026-05-25T09:00:00.000Z', // 180 min ago
        escalation_pinged_at: null,
        dispute_reason: 'too late',
        discord_dispute_thread_id: '1300000000000000001',
      },
      {
        id: 'm-fresh',
        tenant_id: TENANT_ID,
        status: 'disputed',
        team1_id: 'tC',
        team2_id: 'tD',
        dispute_opened_at: '2026-05-25T11:50:00.000Z', // 10 min ago
        escalation_pinged_at: null,
        dispute_reason: 'just now',
        discord_dispute_thread_id: null,
      },
      // non-disputed match — must be ignored
      {
        id: 'm-finished',
        tenant_id: TENANT_ID,
        status: 'finished',
        dispute_opened_at: '2026-05-25T08:00:00.000Z',
      },
    ] as any;

    const rows = await listOpenDisputes(TENANT_ID, { nowMs: NOW_MS });
    expect(rows).toHaveLength(2);
    const byId = Object.fromEntries(rows.map((r) => [r.matchId, r]));
    expect(byId['m-old'].classification).toBe('breached');
    expect(byId['m-old'].ageMinutes).toBe(180);
    expect(byId['m-old'].disputeThreadId).toBe('1300000000000000001');
    expect(byId['m-fresh'].classification).toBe('fresh');
    expect(byId['m-fresh'].ageMinutes).toBe(10);
    expect(byId['m-fresh'].disputeThreadId).toBeNull();
  });

  it('filters by tournamentId when provided', async () => {
    store.matches = [
      {
        id: 'a',
        tenant_id: TENANT_ID,
        tournament_id: 't1',
        status: 'disputed',
        dispute_opened_at: NOW_ISO,
      },
      {
        id: 'b',
        tenant_id: TENANT_ID,
        tournament_id: 't2',
        status: 'disputed',
        dispute_opened_at: NOW_ISO,
      },
    ] as any;
    const rows = await listOpenDisputes(TENANT_ID, {
      tournamentId: 't1',
      nowMs: NOW_MS,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].matchId).toBe('a');
  });
});

describe('findUnpingedBreaches', () => {
  it('returns only rows breached AND not pinged', async () => {
    store.matches = [
      {
        id: 'breach',
        tenant_id: TENANT_ID,
        status: 'disputed',
        dispute_opened_at: '2026-05-25T09:00:00.000Z', // 180 min ago
        escalation_pinged_at: null,
        team1_id: 'tA',
        team2_id: 'tB',
        dispute_reason: 'r',
      },
      {
        id: 'breach-but-pinged',
        tenant_id: TENANT_ID,
        status: 'disputed',
        dispute_opened_at: '2026-05-25T09:00:00.000Z',
        escalation_pinged_at: '2026-05-25T09:30:00.000Z',
      },
      {
        id: 'still-fresh',
        tenant_id: TENANT_ID,
        status: 'disputed',
        dispute_opened_at: NOW_ISO,
        escalation_pinged_at: null,
      },
    ] as any;

    const breaches = await findUnpingedBreaches(TENANT_ID, NOW_MS);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].matchId).toBe('breach');
    expect(breaches[0].ageMinutes).toBe(180);
    expect(breaches[0].slaMinutes).toBe(60);
  });
});

describe('markEscalationPinged', () => {
  it('sets escalation_pinged_at on the matching rows', async () => {
    store.matches = [
      {
        id: 'a',
        tenant_id: TENANT_ID,
        status: 'disputed',
        escalation_pinged_at: null,
      },
      {
        id: 'b',
        tenant_id: TENANT_ID,
        status: 'disputed',
        escalation_pinged_at: null,
      },
    ] as any;

    await markEscalationPinged(TENANT_ID, ['a'], NOW_ISO);
    expect(
      (store.matches as any[]).find((m) => m.id === 'a').escalation_pinged_at
    ).toBe(NOW_ISO);
    expect(
      (store.matches as any[]).find((m) => m.id === 'b').escalation_pinged_at
    ).toBeNull();
  });

  it('is a no-op for an empty matchIds list', async () => {
    store.matches = [
      {
        id: 'a',
        tenant_id: TENANT_ID,
        status: 'disputed',
        escalation_pinged_at: null,
      },
    ] as any;
    await markEscalationPinged(TENANT_ID, [], NOW_ISO);
    expect((store.matches as any[])[0].escalation_pinged_at).toBeNull();
  });
});
