// Sondage MVP du public dans la source Régie : TEST, réglages, vote échu.
//
//   - le faux vote de TEST (calculé, rien d'écrit) : déroulé vote → résultat ;
//   - le flux de la source : le test s'affiche, mais jamais devant un vrai
//     vote ouvert ; les réglages d'affichage suivent le scrutin ;
//   - un vote ÉCHU sans clôture reste à l'écran comme clos (avec l'élue
//     provisoire), au lieu de vider la source au moment du résultat ;
//   - un vote échu se ROUVRE ;
//   - la route admin : réglages (manage_broadcast), test (régie).

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  buildDemoPoll,
  DEMO_OPEN_MS,
  DEMO_TOTAL_MS,
} from '../../utils/overlay/publicMvpDemo';
import {
  provisionalWinner,
  readPublicMvpFeed,
} from '../../utils/overlay/publicMvpFeed';
import { openPublicVote } from '../../utils/mvp/publicVote';
import mvpOverlayHandler from '../../pages/api/admin/diffusion/mvp-overlay';

const TENANT = DEFAULT_TENANT_ID;
const MATCH = '11111111-1111-4111-8111-111111111111';
const TEAM_A = '22222222-2222-4222-8222-2222222222aa';
const TEAM_B = '22222222-2222-4222-8222-2222222222bb';
const ALICE = '33333333-3333-4333-8333-333333333aaa';
const BEA = '33333333-3333-4333-8333-333333333bbb';

/* ------------------------------------------------------------ faux vote */

describe('buildDemoPoll', () => {
  const t0 = Date.parse('2026-09-30T20:00:00Z');

  it('n’existe qu’entre le départ et la fin du test', () => {
    expect(buildDemoPoll(t0, t0 - 1)).toBeNull();
    expect(buildDemoPoll(t0, t0 + DEMO_TOTAL_MS)).toBeNull();
    expect(buildDemoPoll(t0, t0)?.isDemo).toBe(true);
  });

  it('vote qui monte, puis résultat avec une élue', () => {
    const early = buildDemoPoll(t0, t0 + 5_000);
    const late = buildDemoPoll(t0, t0 + DEMO_OPEN_MS - 1_000);
    expect(early?.isOpen).toBe(true);
    expect(late!.total).toBeGreaterThan(early!.total);
    expect(late?.winnerMemberId).toBeNull();

    const result = buildDemoPoll(t0, t0 + DEMO_OPEN_MS + 1_000);
    expect(result?.isOpen).toBe(false);
    expect(result?.winnerLabel).toBe('Nova');
    expect(result?.candidates[0].label).toBe('Nova');
    // Même instant = même état : chaque rafraîchissement de la source concorde.
    expect(buildDemoPoll(t0, t0 + 12_345)).toEqual(
      buildDemoPoll(t0, t0 + 12_345)
    );
  });
});

describe('provisionalWinner', () => {
  const row = (memberId: string, votes: number) => ({
    memberId,
    label: memberId,
    teamName: null,
    votes,
    share: 0,
  });
  it('la tête seule, avec le minimum de voix', () => {
    expect(provisionalWinner([row('a', 3), row('b', 1)], 4)?.memberId).toBe(
      'a'
    );
    expect(provisionalWinner([row('a', 2), row('b', 2)], 4)).toBeNull();
    expect(provisionalWinner([row('a', 2)], 2)).toBeNull();
  });
});

/* ---------------------------------------------------------------- flux */

function seed() {
  store.tenants = [
    {
      id: TENANT,
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
    },
  ] as any;
  store.matches = [
    {
      id: MATCH,
      tenant_id: TENANT,
      tournament_id: null,
      status: 'finished',
      round_name: 'J1',
      team1_id: TEAM_A,
      team2_id: TEAM_B,
    },
  ] as any;
  store.teams = [
    { id: TEAM_A, tenant_id: TENANT, name: 'Les Alpines' },
    { id: TEAM_B, tenant_id: TENANT, name: 'Les Bravos' },
  ] as any;
  store.team_members = [
    {
      id: ALICE,
      tenant_id: TENANT,
      team_id: TEAM_A,
      battle_tag: 'Alice#1111',
      display_name: 'Alice',
      is_substitute: false,
    },
    {
      id: BEA,
      tenant_id: TENANT,
      team_id: TEAM_B,
      battle_tag: 'Bea#2222',
      display_name: 'Bea',
      is_substitute: false,
    },
  ] as any;
  store.match_participants = [] as any;
  store.match_public_mvp_polls = [] as any;
  store.match_public_mvp_votes = [] as any;
  store.public_mvp_overlay_settings = [] as any;
}

const poll = (over: Record<string, unknown> = {}) => ({
  id: 'poll-1',
  tenant_id: TENANT,
  match_id: MATCH,
  opened_at: new Date(Date.now() - 600_000).toISOString(),
  closes_at: new Date(Date.now() + 300_000).toISOString(),
  closed_at: null,
  candidate_member_ids: [ALICE, BEA],
  winner_member_id: null,
  winner_battle_tag: null,
  winner_votes: null,
  total_votes: null,
  settled_at: null,
  discord_channel_id: null,
  discord_message_id: null,
  ...over,
});

const vote = (voterKey: string, memberId: string) => ({
  id: `v-${voterKey}`,
  tenant_id: TENANT,
  match_id: MATCH,
  member_id: memberId,
  source: 'discord',
  voter_key: voterKey,
});

const demoRunning = (over: Record<string, unknown> = {}) => ({
  tenant_id: TENANT,
  window_minutes: 10,
  position: 'bottom',
  show_sources: false,
  demo_started_at: new Date(Date.now() - 5_000).toISOString(),
  demo_until: new Date(Date.now() + 50_000).toISOString(),
  ...over,
});

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  seed();
});

describe('readPublicMvpFeed', () => {
  it('rien à l’écran sans vote ni test', async () => {
    expect(await readPublicMvpFeed(TENANT)).toBeNull();
  });

  it('le TEST s’affiche, marqué, avec les réglages d’affichage', async () => {
    store.public_mvp_overlay_settings = [demoRunning()] as any;
    const feed = await readPublicMvpFeed(TENANT);
    expect(feed?.isDemo).toBe(true);
    expect(feed?.display).toEqual({ position: 'bottom', showSources: false });
  });

  it('un vrai vote OUVERT passe devant le test', async () => {
    store.public_mvp_overlay_settings = [demoRunning()] as any;
    store.match_public_mvp_polls = [poll()] as any;
    const feed = await readPublicMvpFeed(TENANT);
    expect(feed?.isDemo).toBeUndefined();
    expect(feed?.matchId).toBe(MATCH);
    expect(feed?.display?.position).toBe('bottom');
  });

  it('vote ÉCHU sans clôture : montré clos, avec l’élue provisoire', async () => {
    store.match_public_mvp_polls = [
      poll({ closes_at: new Date(Date.now() - 30_000).toISOString() }),
    ] as any;
    store.match_public_mvp_votes = [
      vote('a', ALICE),
      vote('b', ALICE),
      vote('c', ALICE),
      vote('d', BEA),
    ] as any;
    const feed = await readPublicMvpFeed(TENANT);
    expect(feed?.isOpen).toBe(false);
    expect(feed?.winnerMemberId).toBe(ALICE);
    expect(feed?.winnerLabel).toContain('Alice');
  });

  it('vote échu depuis longtemps : la source se vide', async () => {
    store.match_public_mvp_polls = [
      poll({ closes_at: new Date(Date.now() - 3_600_000).toISOString() }),
    ] as any;
    expect(await readPublicMvpFeed(TENANT)).toBeNull();
  });
});

describe('openPublicVote', () => {
  it('rouvre un vote dont la fenêtre est passée sans clôture', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    store.match_public_mvp_polls = [poll({ closes_at: past })] as any;
    const r = await openPublicVote(TENANT, MATCH, { windowMinutes: 5 });
    expect(r?.alreadyOpen).toBe(false);
    expect(new Date(r!.poll.closes_at as string).getTime()).toBeGreaterThan(
      Date.now()
    );
  });

  it('un vote en cours reste idempotent', async () => {
    store.match_public_mvp_polls = [poll()] as any;
    const r = await openPublicVote(TENANT, MATCH, { windowMinutes: 5 });
    expect(r?.alreadyOpen).toBe(true);
  });
});

/* ---------------------------------------------------------- route admin */

function staffRow(role: 'admin' | 'caster'): StaffMember {
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
let n = 0;
function req(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${n}` },
    query: {},
    body: {},
    cookies: {},
    ...over,
  };
}
function res() {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  return r;
}

describe('/api/admin/diffusion/mvp-overlay', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [staffRow('admin')] as any;
    store.staff_logs = [] as any;
  });

  it('GET : valeurs par défaut sans réglage enregistré', async () => {
    const r = res();
    await mvpOverlayHandler(req(), r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({
      settings: { window_minutes: 10, position: 'top', show_sources: true },
      demo: { active: false },
    });
  });

  it('PUT enregistre les réglages ; 400 hors bornes', async () => {
    const ok = res();
    await mvpOverlayHandler(
      req({
        method: 'PUT',
        body: { window_minutes: 5, position: 'center', show_sources: false },
      }),
      ok
    );
    expect(ok.statusCode).toBe(200);
    expect((store.public_mvp_overlay_settings as any[])[0]).toMatchObject({
      tenant_id: TENANT,
      window_minutes: 5,
      position: 'center',
    });
    const bad = res();
    await mvpOverlayHandler(
      req({
        method: 'PUT',
        body: { window_minutes: 0, position: 'center', show_sources: true },
      }),
      bad
    );
    expect(bad.statusCode).toBe(400);
  });

  it('POST test-start lance le test (55 s), test-stop l’arrête', async () => {
    const start = res();
    await mvpOverlayHandler(
      req({ method: 'POST', body: { action: 'test-start' } }),
      start
    );
    expect(start.statusCode).toBe(200);
    expect(start.body.demo.active).toBe(true);
    const row = (store.public_mvp_overlay_settings as any[])[0];
    const span = Date.parse(row.demo_until) - Date.parse(row.demo_started_at);
    expect(span).toBe(DEMO_TOTAL_MS);
    expect((await readPublicMvpFeed(TENANT))?.isDemo).toBe(true);

    const stop = res();
    await mvpOverlayHandler(
      req({ method: 'POST', body: { action: 'test-stop' } }),
      stop
    );
    expect(stop.body.demo.active).toBe(false);
    expect(await readPublicMvpFeed(TENANT)).toBeNull();
  });

  it('une casteuse teste mais ne règle pas', async () => {
    store.staff = [staffRow('caster')] as any;
    invalidateStaffCache();
    const test = res();
    await mvpOverlayHandler(
      req({ method: 'POST', body: { action: 'test-start' } }),
      test
    );
    expect(test.statusCode).toBe(200);
    const put = res();
    await mvpOverlayHandler(
      req({
        method: 'PUT',
        body: { window_minutes: 5, position: 'top', show_sources: true },
      }),
      put
    );
    expect(put.statusCode).toBe(403);
  });
});
