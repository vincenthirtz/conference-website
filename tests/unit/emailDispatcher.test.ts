// tests/unit/emailDispatcher.test.ts
//
// Tests pour le dispatcher EMAIL (utils/emailDispatcher.ts → runEmailDispatcher).
//
// On mocke sendDigestEmail (utils/email) pour capturer les envois sans toucher
// Brevo, et on seed les users auth via setAdminUser (auth.admin.getUserById).
// Le store supabase in-memory est partagé (cf. __helpers__/supabaseMock.ts) :
// on seed staff / tenant_staff / matches / team_members / bot_event_outbox /
// notification_prefs / email_deliveries et on assert l'état post-run.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.SITE_URL = 'https://test.example';
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'unsub-secret';
});

const { sendDigestEmail } = vi.hoisted(() => ({
  sendDigestEmail: vi.fn(
    async (
      _opts: unknown
    ): Promise<{ success: boolean; id?: string; error?: string }> => ({
      success: true,
      id: 'msg-1',
    })
  ),
}));

vi.mock('@/utils/email', () => ({
  sendDigestEmail,
}));

import {
  store,
  resetSupabaseMock,
  setAdminUser,
} from './__helpers__/supabaseMock';
import { runEmailDispatcher } from '../../utils/emailDispatcher';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_A = 'auth-user-a';
const STAFF_A = 'staff-a';
const NOW = '2026-06-28T10:00:00.000Z';

function seedStaff() {
  store.staff = [
    {
      id: STAFF_A,
      auth_user_id: USER_A,
      role: 'caster',
      is_active: true,
      deleted_at: null,
      is_pole_admin: false,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_A, role: 'caster' },
  ] as any;
  store.notification_prefs = [];
  store.email_deliveries = [];
  store.bot_event_outbox = [];
}

function optInEmail(userId: string, eventType: string) {
  (store.notification_prefs as any[]).push({
    user_id: userId,
    event_type: eventType,
    channel: 'email',
    enabled: true,
    updated_at: NOW,
  });
}

function newsEvent(over: Partial<any> = {}) {
  return {
    id: 1,
    event_id: 'evt-news-1',
    event_name: 'news.published',
    tenant_id: TENANT_A,
    payload: { title: 'Hello world', slug: 'hello' },
    created_at: NOW,
    status: 'pending',
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  resetSupabaseMock();
  seedStaff();
  setAdminUser(USER_A, 'user-a@example.com');
  sendDigestEmail.mockReset();
  sendDigestEmail.mockResolvedValue({ success: true, id: 'msg-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

/* ===========================================================================
 * Opt-in gating
 * ===========================================================================*/

describe('opt-in gating', () => {
  it("n'envoie aucun email si le user n'a pas opt-in email", async () => {
    // Pas de row notification_prefs channel='email' → opt-in absent.
    store.bot_event_outbox = [newsEvent()] as any;

    const result = await runEmailDispatcher();
    expect(result.candidates).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(result.recipients).toBe(0);
    expect(sendDigestEmail).not.toHaveBeenCalled();
    expect(store.email_deliveries).toHaveLength(0);
  });

  it('envoie un email quand le user a opt-in email pour cet event', async () => {
    optInEmail(USER_A, 'news.published');
    store.bot_event_outbox = [newsEvent()] as any;

    const result = await runEmailDispatcher();
    expect(result.emailsSent).toBe(1);
    expect(result.recipients).toBe(1);
    expect(sendDigestEmail).toHaveBeenCalledTimes(1);

    const arg = sendDigestEmail.mock.calls[0][0] as any;
    expect(arg.to).toBe('user-a@example.com');
    expect(arg.items).toHaveLength(1);
    expect(arg.items[0].heading).toBe('Nouvelle actualité');
    expect(arg.unsubscribeUrl).toContain(
      'https://test.example/api/email/unsubscribe?token='
    );
  });

  it("n'envoie pas si l'opt-in email concerne un AUTRE event_type", async () => {
    optInEmail(USER_A, 'match.starting'); // pas news.published
    store.bot_event_outbox = [newsEvent()] as any;

    const result = await runEmailDispatcher();
    expect(result.emailsSent).toBe(0);
    expect(sendDigestEmail).not.toHaveBeenCalled();
  });

  it("ignore un opt-in email enabled=false (re-opt-out)", async () => {
    (store.notification_prefs as any[]).push({
      user_id: USER_A,
      event_type: 'news.published',
      channel: 'email',
      enabled: false,
      updated_at: NOW,
    });
    store.bot_event_outbox = [newsEvent()] as any;

    const result = await runEmailDispatcher();
    expect(result.emailsSent).toBe(0);
  });
});

/* ===========================================================================
 * Dedup via email_deliveries
 * ===========================================================================*/

describe('dedup', () => {
  it('skip une paire (event, user) déjà présente dans email_deliveries', async () => {
    optInEmail(USER_A, 'news.published');
    store.email_deliveries = [
      {
        id: 1,
        tenant_id: TENANT_A,
        outbox_event_id: 'evt-news-1',
        user_id: USER_A,
        status: 'sent',
        created_at: NOW,
      },
    ] as any;
    store.bot_event_outbox = [newsEvent()] as any;

    const result = await runEmailDispatcher();
    expect(result.emailsSent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(sendDigestEmail).not.toHaveBeenCalled();
    // Pas de nouvelle row insérée.
    expect(store.email_deliveries).toHaveLength(1);
  });
});

/* ===========================================================================
 * Digest grouping
 * ===========================================================================*/

describe('digest grouping', () => {
  it('groupe 2 events du même user en 1 email avec 2 items', async () => {
    optInEmail(USER_A, 'news.published');
    optInEmail(USER_A, 'team.forfeit');
    store.bot_event_outbox = [
      newsEvent(),
      {
        id: 2,
        event_id: 'evt-forfeit-1',
        event_name: 'team.forfeit',
        tenant_id: TENANT_A,
        payload: { team_name: 'Alpha' },
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    const result = await runEmailDispatcher();
    // Un seul email, deux items.
    expect(result.emailsSent).toBe(1);
    expect(result.recipients).toBe(1);
    expect(sendDigestEmail).toHaveBeenCalledTimes(1);

    const arg = sendDigestEmail.mock.calls[0][0] as any;
    expect(arg.items).toHaveLength(2);
    const headings = arg.items.map((i: any) => i.heading);
    expect(headings).toContain('Nouvelle actualité');
    expect(headings).toContain('Forfait');
  });
});

/* ===========================================================================
 * Ledger
 * ===========================================================================*/

describe('ledger', () => {
  it('inscrit une row email_deliveries par event inclus (status sent)', async () => {
    optInEmail(USER_A, 'news.published');
    optInEmail(USER_A, 'team.forfeit');
    store.bot_event_outbox = [
      newsEvent(),
      {
        id: 2,
        event_id: 'evt-forfeit-1',
        event_name: 'team.forfeit',
        tenant_id: TENANT_A,
        payload: { team_name: 'Alpha' },
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    await runEmailDispatcher();

    expect(store.email_deliveries).toHaveLength(2);
    for (const row of store.email_deliveries as any[]) {
      expect(row.status).toBe('sent');
      expect(row.user_id).toBe(USER_A);
      expect(row.tenant_id).toBe(TENANT_A);
    }
    const eventIds = (store.email_deliveries as any[])
      .map((r) => r.outbox_event_id)
      .sort();
    expect(eventIds).toEqual(['evt-forfeit-1', 'evt-news-1']);
  });

  it('inscrit status=failed quand sendDigestEmail échoue', async () => {
    optInEmail(USER_A, 'news.published');
    sendDigestEmail.mockResolvedValue({ success: false, error: 'boom' });
    store.bot_event_outbox = [newsEvent()] as any;

    const result = await runEmailDispatcher();
    expect(result.emailsSent).toBe(0);
    expect(store.email_deliveries).toHaveLength(1);
    expect((store.email_deliveries as any[])[0].status).toBe('failed');
  });
});

/* ===========================================================================
 * Max-per-run cap
 * ===========================================================================*/

describe('max-per-run cap', () => {
  it('plafonne le nombre de destinataires par run (EMAIL_DIGEST_MAX_PER_RUN)', async () => {
    process.env.EMAIL_DIGEST_MAX_PER_RUN = '1';

    // 2 users staff, chacun opt-in, un event chacun (events séparés pour que
    // chacun ait son audience). On vise les deux via 2 staff du même tenant.
    const USER_B = 'auth-user-b';
    const STAFF_B = 'staff-b';
    (store.staff as any[]).push({
      id: STAFF_B,
      auth_user_id: USER_B,
      role: 'caster',
      is_active: true,
      deleted_at: null,
      is_pole_admin: false,
    });
    (store.tenant_staff as any[]).push({
      tenant_id: TENANT_A,
      staff_id: STAFF_B,
      role: 'caster',
    });
    setAdminUser(USER_B, 'user-b@example.com');
    optInEmail(USER_A, 'news.published');
    optInEmail(USER_B, 'news.published');
    store.bot_event_outbox = [newsEvent()] as any;

    const result = await runEmailDispatcher();
    // Deux destinataires éligibles mais cap=1 → un seul email envoyé.
    expect(result.recipients).toBe(1);
    expect(sendDigestEmail).toHaveBeenCalledTimes(1);

    delete process.env.EMAIL_DIGEST_MAX_PER_RUN;
  });
});

/* ===========================================================================
 * No email resolved
 * ===========================================================================*/

describe('email resolution', () => {
  it("ne crée pas de ledger si l'email du user est introuvable", async () => {
    optInEmail(USER_A, 'news.published');
    // Pas de setAdminUser pour USER_A → getUserById renvoie user:null.
    // On efface l'admin user seedé en beforeEach en re-seedant le store.
    resetSupabaseMock();
    seedStaff();
    optInEmail(USER_A, 'news.published');
    store.bot_event_outbox = [newsEvent()] as any;

    const result = await runEmailDispatcher();
    expect(result.emailsSent).toBe(0);
    expect(sendDigestEmail).not.toHaveBeenCalled();
    // Rien inscrit → réessayable plus tard.
    expect(store.email_deliveries ?? []).toHaveLength(0);
  });
});
