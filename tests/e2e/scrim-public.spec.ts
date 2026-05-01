import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  deleteTeamsByName,
  deleteTestUser,
  createTestPlayer,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const PREFIX = `E2E-SCRPUB-${Date.now()}`;
const CAPTAIN_EMAIL = `test-scrpub-cap-${Date.now()}@test.local`;
const PASSWORD = 'TestPassword123!';

async function fetchCaptcha(request: any): Promise<{
  token: string;
  answer: string;
}> {
  const res = await request.get('/api/captcha');
  expect(res.ok()).toBeTruthy();
  const { token, question } = await res.json();
  const m = (question as string).match(/^(\d+)\s+([+\-×])\s+(\d+)$/)!;
  const a = Number(m[1]);
  const b = Number(m[3]);
  let answer = 0;
  if (m[2] === '+') answer = a + b;
  if (m[2] === '-') answer = a - b;
  if (m[2] === '×') answer = a * b;
  return { token, answer: String(answer) };
}

test.describe('Public scrim requests API (/api/public/scrim-requests)', () => {
  let captainToken: string;
  let captainUserId: string;
  let teamId: string;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await deleteTeamsByName([`${PREFIX}%`]);
    await deleteTestUser(CAPTAIN_EMAIL);

    const captain = await createTestPlayer(CAPTAIN_EMAIL, PASSWORD);
    captainUserId = captain!.id;

    const { data: auth } = await supabaseTestClient!.auth.signInWithPassword({
      email: CAPTAIN_EMAIL,
      password: PASSWORD,
    });
    captainToken = auth.session!.access_token;

    const { data: team } = await supabaseTestClient!
      .from('teams')
      .insert({
        name: `${PREFIX}-team`,
        captain_id: captainUserId,
        is_active: true,
      })
      .select('id')
      .single();
    teamId = team!.id;

    await supabaseTestClient!.from('team_members').insert({
      team_id: teamId,
      user_id: captainUserId,
      role: 'player',
      battle_tag: 'Captain#0001',
    });
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE) return;
    if (teamId) {
      await supabaseTestClient!.from('demandes').delete().eq('team_id', teamId);
    }
    await deleteTeamsByName([`${PREFIX}%`]);
    await deleteTestUser(CAPTAIN_EMAIL);
  });

  test('GET returns 405', async ({ request }) => {
    const res = await request.get('/api/public/scrim-requests');
    expect(res.status()).toBe(405);
  });

  test('rejects when honeypot is filled', async ({ request }) => {
    const captcha = await fetchCaptcha(request);
    const res = await request.post('/api/public/scrim-requests', {
      data: {
        targetTeamId: teamId,
        fromTeamName: 'Bots',
        requesterName: 'Bot',
        requesterEmail: 'bot@example.com',
        captchaToken: captcha.token,
        captchaAnswer: captcha.answer,
        honeypot: 'caught',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects malformed email', async ({ request }) => {
    const captcha = await fetchCaptcha(request);
    const res = await request.post('/api/public/scrim-requests', {
      data: {
        targetTeamId: teamId,
        fromTeamName: 'Visitors',
        requesterName: 'Alice',
        requesterEmail: 'not-an-email',
        captchaToken: captcha.token,
        captchaAnswer: captcha.answer,
      },
    });
    expect(res.status()).toBe(400);
  });

  test('full flow: visitor submits → captain sees external request → accepts', async ({
    request,
  }) => {
    const captcha = await fetchCaptcha(request);
    const submitRes = await request.post('/api/public/scrim-requests', {
      data: {
        targetTeamId: teamId,
        fromTeamName: `${PREFIX}-visitors`,
        requesterName: 'Alice External',
        requesterEmail: `alice-${Date.now()}@example.com`,
        requesterDiscord: 'alice#1234',
        message: 'Yo, on aimerait jouer contre vous samedi.',
        format: '5v5 BO3',
        captchaToken: captcha.token,
        captchaAnswer: captcha.answer,
      },
    });
    expect(submitRes.status()).toBe(201);

    // Captain pulls pending scrim list — should see the external request with
    // contact info surfaced from payload.
    const listRes = await request.get('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainToken}` },
    });
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    const ours = (list.demandes as any[]).find(
      (d) => d.payload?.from_team_name === `${PREFIX}-visitors`
    );
    expect(ours).toBeTruthy();
    expect(ours.source).toBe('public');
    expect(ours.user_id).toBe(null);
    expect(ours.user?.display_name).toBe('Alice External');
    expect(ours.user?.discord).toBe('alice#1234');

    // Captain accepts.
    const approveRes = await request.post('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { demandeId: ours.id, action: 'approve' },
    });
    expect(approveRes.status()).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.newStatus).toBe('approved');

    // Mirror notification demande should exist for the team.
    const { data: mirrors } = await supabaseTestClient!
      .from('demandes')
      .select('id, payload, comment')
      .eq('team_id', teamId)
      .eq('type', 'other')
      .filter('payload->>notification_type', 'eq', 'scrim_accepted');
    expect((mirrors || []).length).toBeGreaterThanOrEqual(1);
  });

  test('captain can report an external scrim as spam', async ({ request }) => {
    // Submit a fresh public request (using a new email to bypass dedup window).
    const captcha = await fetchCaptcha(request);
    const submitRes = await request.post('/api/public/scrim-requests', {
      data: {
        targetTeamId: teamId,
        fromTeamName: `${PREFIX}-spammer`,
        requesterName: 'Spam',
        requesterEmail: `spam-${Date.now()}@example.com`,
        captchaToken: captcha.token,
        captchaAnswer: captcha.answer,
      },
    });
    expect(submitRes.status()).toBe(201);

    const listRes = await request.get('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainToken}` },
    });
    const list = await listRes.json();
    const target = (list.demandes as any[]).find(
      (d) => d.payload?.from_team_name === `${PREFIX}-spammer`
    );
    expect(target).toBeTruthy();

    const reportRes = await request.post('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { demandeId: target.id, action: 'report' },
    });
    expect(reportRes.status()).toBe(200);
    const reportBody = await reportRes.json();
    expect(reportBody.newStatus).toBe('cancelled');
  });
});
