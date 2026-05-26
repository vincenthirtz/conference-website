// Tests for the MOBA draft auto-pick cron (Lot 3 — server-side timer).
// Covers the cross-tenant scan in runDraftAutoPickTick() + the HTTP wrapper
// in /api/cron/draft-auto-pick.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
} from './__helpers__/supabaseMock';

import { runDraftAutoPickTick } from '../../utils/draftEngine';
import cronHandler from '../../pages/api/cron/draft-auto-pick';

const TENANT_A = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID
const TENANT_B = '00000000-0000-4000-8000-00000000000b';

const MATCH_A = '11111111-1111-4111-8111-111111111111';
const MATCH_B = '11111111-1111-4111-8111-111111111112';
const MATCH_C = '11111111-1111-4111-8111-111111111113';

const TOURN_A = '22222222-2222-4222-8222-22222222aaaa';
const TOURN_B = '22222222-2222-4222-8222-22222222bbbb';

const DRAFT_EXPIRED = '44444444-4444-4444-4444-444444444401';
const DRAFT_FUTURE = '44444444-4444-4444-4444-444444444402';
const DRAFT_COMPLETED = '44444444-4444-4444-4444-444444444403';

const HERO_AATROX = '33333333-3333-4333-8333-333333330001';
const HERO_AHRI = '33333333-3333-4333-8333-333333330002';

const NOW = new Date('2026-05-26T12:00:00.000Z').getTime();
const PAST = new Date('2026-05-26T11:59:00.000Z').toISOString();
const FUTURE = new Date('2026-05-26T12:05:00.000Z').toISOString();

function seed() {
  store.matches = [
    {
      id: MATCH_A,
      tenant_id: TENANT_A,
      tournament_id: TOURN_A,
      match_format: 'bo3',
    },
    {
      id: MATCH_B,
      tenant_id: TENANT_B,
      tournament_id: TOURN_B,
      match_format: 'bo1',
    },
    {
      id: MATCH_C,
      tenant_id: TENANT_A,
      tournament_id: TOURN_A,
      match_format: 'bo1',
    },
  ] as any;
  store.tournaments = [
    { id: TOURN_A, game: 'lol', tenant_id: TENANT_A },
    { id: TOURN_B, game: 'lol', tenant_id: TENANT_B },
  ] as any;
  store.game_heroes = [
    {
      id: HERO_AATROX,
      game: 'lol',
      external_id: '266',
      key: 'Aatrox',
      name: 'Aatrox',
      enabled: true,
    },
    {
      id: HERO_AHRI,
      game: 'lol',
      external_id: '103',
      key: 'Ahri',
      name: 'Ahri',
      enabled: true,
    },
  ] as any;
  store.match_drafts = [
    {
      id: DRAFT_EXPIRED,
      match_id: MATCH_A,
      game_index: 1,
      game: 'lol',
      tenant_id: TENANT_A,
      status: 'in_progress',
      current_step: 0,
      team1_side: 'blue',
      team2_side: 'red',
      fearless: false,
      pick_timer_seconds: 30,
      started_at: PAST,
    },
    {
      id: DRAFT_FUTURE,
      match_id: MATCH_B,
      game_index: 1,
      game: 'lol',
      tenant_id: TENANT_B,
      status: 'in_progress',
      current_step: 0,
      team1_side: 'blue',
      team2_side: 'red',
      fearless: false,
      pick_timer_seconds: 30,
      started_at: PAST,
    },
    {
      id: DRAFT_COMPLETED,
      match_id: MATCH_C,
      game_index: 1,
      game: 'lol',
      tenant_id: TENANT_A,
      status: 'completed',
      current_step: 1,
      team1_side: 'blue',
      team2_side: 'red',
      fearless: false,
      pick_timer_seconds: 30,
    },
  ] as any;
  store.match_draft_steps = [
    // EXPIRED draft : step 1 is the current step, deadline in the past.
    {
      id: 'step-expired-1',
      draft_id: DRAFT_EXPIRED,
      step_number: 1,
      phase: 'ban_1',
      action: 'ban',
      side: 'team1',
      hero_id: null,
      deadline_at: PAST,
      auto_picked: false,
    },
    // FUTURE draft : step 1, deadline far in the future → cron should skip.
    {
      id: 'step-future-1',
      draft_id: DRAFT_FUTURE,
      step_number: 1,
      phase: 'ban_1',
      action: 'ban',
      side: 'team1',
      hero_id: null,
      deadline_at: FUTURE,
      auto_picked: false,
    },
    // COMPLETED draft : final step already committed, no deadline left.
    {
      id: 'step-completed-1',
      draft_id: DRAFT_COMPLETED,
      step_number: 1,
      phase: 'ban_1',
      action: 'ban',
      side: 'team1',
      hero_id: HERO_AHRI,
      deadline_at: null,
      auto_picked: false,
      committed_at: PAST,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  process.env.CRON_SECRET = 'test-secret';
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  seed();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runDraftAutoPickTick', () => {
  it('auto-picks the expired draft, leaves the future one alone', async () => {
    const summary = await runDraftAutoPickTick({ now: NOW });

    expect(summary.scanned).toBe(1);
    expect(summary.autoPicked).toBe(1);
    expect(summary.errors).toBe(0);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].draftId).toBe(DRAFT_EXPIRED);
    expect(summary.results[0].stepNumber).toBe(1);
    // First alphabetical eligible LoL hero is Aatrox.
    expect(summary.results[0].heroId).toBe(HERO_AATROX);

    const stepRow = (store.match_draft_steps as any[]).find(
      (s) => s.id === 'step-expired-1'
    );
    expect(stepRow.hero_id).toBe(HERO_AATROX);
    expect(stepRow.auto_picked).toBe(true);

    const futureStep = (store.match_draft_steps as any[]).find(
      (s) => s.id === 'step-future-1'
    );
    expect(futureStep.hero_id).toBeNull();
  });

  it('is a no-op when nothing is expired', async () => {
    // Move the only expired deadline into the future.
    const expired = (store.match_draft_steps as any[]).find(
      (s) => s.id === 'step-expired-1'
    );
    expired.deadline_at = FUTURE;

    const summary = await runDraftAutoPickTick({ now: NOW });
    expect(summary.scanned).toBe(0);
    expect(summary.autoPicked).toBe(0);
  });
});

/* -----------------------------------------------------------
 * HTTP wrapper /api/cron/draft-auto-pick
 * ---------------------------------------------------------*/

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h' },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

describe('POST /api/cron/draft-auto-pick', () => {
  it('rejects requests without the bearer secret', async () => {
    const req = makeReq();
    const res = makeRes();
    await cronHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('runs the tick when authorized and returns a summary', async () => {
    const req = makeReq({
      headers: { host: 'h', authorization: 'Bearer test-secret' },
    });
    const res = makeRes();
    await cronHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scanned).toBeGreaterThanOrEqual(1);
    expect(res.body.autoPicked).toBeGreaterThanOrEqual(1);
  });

  it('rejects bogus methods', async () => {
    const req = makeReq({ method: 'DELETE' });
    const res = makeRes();
    await cronHandler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
