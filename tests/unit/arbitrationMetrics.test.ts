import { describe, it, expect } from 'vitest';

import {
  computeArbitrationMetrics,
  type ArbitrationMatchRow,
} from '../../utils/disputes/arbitrationMetrics';

const NOW_ISO = '2026-05-25T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);
const SLA = 60;

describe('computeArbitrationMetrics', () => {
  it('returns clean zeros + nulls when there are no disputes', () => {
    const rows: ArbitrationMatchRow[] = [
      {
        status: 'finished',
        dispute_opened_at: null,
        dispute_resolved_at: null,
      },
      { status: 'pending' },
    ];
    const m = computeArbitrationMetrics(rows, SLA, NOW_MS);
    expect(m).toEqual({
      totalDisputes: 0,
      open: 0,
      resolved: 0,
      avgResolutionMinutes: null,
      medianResolutionMinutes: null,
      withinSlaCount: 0,
      slaComplianceRate: null,
      openBreakdown: { breached: 0, approaching: 0, fresh: 0 },
      slaMinutes: 60,
    });
  });

  it('handles empty / non-array input defensively', () => {
    const m = computeArbitrationMetrics([], SLA, NOW_MS);
    expect(m.totalDisputes).toBe(0);
    // @ts-expect-error — exercising runtime robustness
    const m2 = computeArbitrationMetrics(null, SLA, NOW_MS);
    expect(m2.totalDisputes).toBe(0);
    expect(m2.slaMinutes).toBe(60);
  });

  it('computes resolved durations, within/outside SLA and an even median', () => {
    const rows: ArbitrationMatchRow[] = [
      // 30 min → within SLA
      {
        status: 'finished',
        dispute_opened_at: '2026-05-25T11:00:00.000Z',
        dispute_resolved_at: '2026-05-25T11:30:00.000Z',
      },
      // 180 min → outside SLA
      {
        status: 'finished',
        dispute_opened_at: '2026-05-25T09:00:00.000Z',
        dispute_resolved_at: '2026-05-25T12:00:00.000Z',
      },
    ];
    const m = computeArbitrationMetrics(rows, SLA, NOW_MS);
    expect(m.totalDisputes).toBe(2);
    expect(m.open).toBe(0);
    expect(m.resolved).toBe(2);
    expect(m.avgResolutionMinutes).toBe(105); // (30 + 180) / 2
    expect(m.medianResolutionMinutes).toBe(105); // (30 + 180) / 2
    expect(m.withinSlaCount).toBe(1);
    expect(m.slaComplianceRate).toBe(0.5);
    expect(m.openBreakdown).toEqual({ breached: 0, approaching: 0, fresh: 0 });
  });

  it('computes an odd median and SLA boundary (== SLA counts as within)', () => {
    const rows: ArbitrationMatchRow[] = [
      // 30 min
      {
        status: 'finished',
        dispute_opened_at: '2026-05-25T11:00:00.000Z',
        dispute_resolved_at: '2026-05-25T11:30:00.000Z',
      },
      // 60 min → exactly SLA, still within
      {
        status: 'finished',
        dispute_opened_at: '2026-05-25T10:00:00.000Z',
        dispute_resolved_at: '2026-05-25T11:00:00.000Z',
      },
      // 180 min
      {
        status: 'finished',
        dispute_opened_at: '2026-05-25T09:00:00.000Z',
        dispute_resolved_at: '2026-05-25T12:00:00.000Z',
      },
    ];
    const m = computeArbitrationMetrics(rows, SLA, NOW_MS);
    expect(m.resolved).toBe(3);
    expect(m.avgResolutionMinutes).toBe(90); // 270 / 3
    expect(m.medianResolutionMinutes).toBe(60); // middle of [30, 60, 180]
    expect(m.withinSlaCount).toBe(2); // 30 and 60
    expect(m.slaComplianceRate).toBe(0.6667); // 2/3 rounded to 4dp
  });

  it('buckets OPEN disputes via classifyAge (breached / approaching / fresh)', () => {
    const rows: ArbitrationMatchRow[] = [
      // 180 min ago → breached
      {
        status: 'disputed',
        dispute_opened_at: '2026-05-25T09:00:00.000Z',
        dispute_resolved_at: null,
      },
      // 50 min ago → >= 0.75*60 → approaching
      {
        status: 'disputed',
        dispute_opened_at: '2026-05-25T11:10:00.000Z',
        dispute_resolved_at: null,
      },
      // 5 min ago → fresh
      {
        status: 'disputed',
        dispute_opened_at: '2026-05-25T11:55:00.000Z',
        dispute_resolved_at: null,
      },
    ];
    const m = computeArbitrationMetrics(rows, SLA, NOW_MS);
    expect(m.totalDisputes).toBe(3);
    expect(m.open).toBe(3);
    expect(m.resolved).toBe(0);
    expect(m.avgResolutionMinutes).toBeNull();
    expect(m.medianResolutionMinutes).toBeNull();
    expect(m.slaComplianceRate).toBeNull();
    expect(m.openBreakdown).toEqual({
      breached: 1,
      approaching: 1,
      fresh: 1,
    });
  });

  it('counts a re-opened dispute (resolved_at reset to null) as OPEN, not resolved', () => {
    const rows: ArbitrationMatchRow[] = [
      // Was resolved, then re-opened: status back to disputed, resolved_at null.
      {
        status: 'disputed',
        dispute_opened_at: '2026-05-25T09:00:00.000Z',
        dispute_resolved_at: null,
      },
      // A genuinely resolved one alongside it.
      {
        status: 'finished',
        dispute_opened_at: '2026-05-25T11:00:00.000Z',
        dispute_resolved_at: '2026-05-25T11:30:00.000Z',
      },
    ];
    const m = computeArbitrationMetrics(rows, SLA, NOW_MS);
    expect(m.totalDisputes).toBe(2);
    expect(m.open).toBe(1);
    expect(m.resolved).toBe(1);
    expect(m.openBreakdown.breached).toBe(1);
    expect(m.avgResolutionMinutes).toBe(30);
    expect(m.medianResolutionMinutes).toBe(30);
    expect(m.withinSlaCount).toBe(1);
    expect(m.slaComplianceRate).toBe(1);
  });

  it('mixes open + resolved and reflects the tenant SLA in the output', () => {
    const rows: ArbitrationMatchRow[] = [
      {
        status: 'disputed',
        dispute_opened_at: '2026-05-25T09:00:00.000Z',
        dispute_resolved_at: null,
      },
      {
        status: 'finished',
        dispute_opened_at: '2026-05-25T11:00:00.000Z',
        dispute_resolved_at: '2026-05-25T11:45:00.000Z', // 45 min
      },
      // not a dispute at all
      { status: 'pending' },
    ];
    const m = computeArbitrationMetrics(rows, 90, NOW_MS);
    expect(m.slaMinutes).toBe(90);
    expect(m.totalDisputes).toBe(2);
    expect(m.open).toBe(1);
    expect(m.resolved).toBe(1);
    expect(m.withinSlaCount).toBe(1); // 45 <= 90
    expect(m.slaComplianceRate).toBe(1);
    // 180 min old open dispute, SLA 90 → breached
    expect(m.openBreakdown.breached).toBe(1);
  });

  it('counts a resolved row missing opened_at as resolved but with no duration', () => {
    const rows: ArbitrationMatchRow[] = [
      {
        status: 'finished',
        dispute_opened_at: null,
        dispute_resolved_at: '2026-05-25T11:30:00.000Z',
      },
    ];
    const m = computeArbitrationMetrics(rows, SLA, NOW_MS);
    expect(m.totalDisputes).toBe(1); // resolved_at implies the match had a dispute
    expect(m.resolved).toBe(1);
    // No opened_at → cannot measure duration → excluded from avg/median/withinSla.
    expect(m.avgResolutionMinutes).toBeNull();
    expect(m.medianResolutionMinutes).toBeNull();
    expect(m.withinSlaCount).toBe(0);
    expect(m.slaComplianceRate).toBe(0); // 0 / 1
  });

  it('ignores negative durations from clock skew / manual edits', () => {
    const rows: ArbitrationMatchRow[] = [
      {
        status: 'finished',
        dispute_opened_at: '2026-05-25T12:00:00.000Z',
        dispute_resolved_at: '2026-05-25T11:00:00.000Z', // resolved before opened
      },
    ];
    const m = computeArbitrationMetrics(rows, SLA, NOW_MS);
    expect(m.resolved).toBe(1);
    expect(m.avgResolutionMinutes).toBeNull();
    expect(m.withinSlaCount).toBe(0);
    expect(m.slaComplianceRate).toBe(0);
  });
});
