import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.CRON_SECRET = 'cron-test-secret';
});

const {
  processCheckinForUpcomingMatches,
  notifySupportTicket,
  sendSupportConfirmationEmail,
  sendSupportStaffNotificationEmail,
} = vi.hoisted(() => ({
  processCheckinForUpcomingMatches: vi.fn(async () => ({
    scanned: 0,
    acted: 0,
    errors: 0,
    details: [],
  })),
  notifySupportTicket: vi.fn(async () => ({ messageId: null })),
  sendSupportConfirmationEmail: vi.fn(async () => undefined),
  sendSupportStaffNotificationEmail: vi.fn(async () => undefined),
}));

vi.mock('@/utils/checkin', () => ({
  processCheckinForUpcomingMatches,
}));
vi.mock('@/utils/discord', () => ({
  notifySupportTicket,
}));
vi.mock('@/utils/email', () => ({
  sendSupportConfirmationEmail,
  sendSupportStaffNotificationEmail,
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import cronCheckinHandler from '../../pages/api/cron/checkin-process';
import newsCommentsHandler from '../../pages/api/news/comments';
import supportTicketHandler from '../../pages/api/support/ticket';
import { generateChallenge } from '../../utils/captcha';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
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

beforeEach(() => {
  resetSupabaseMock();
  processCheckinForUpcomingMatches.mockClear();
  notifySupportTicket.mockClear();
  sendSupportConfirmationEmail.mockClear();
  sendSupportStaffNotificationEmail.mockClear();
});

const TID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/cron/checkin-process
 * ---------------------------------------------------------*/

describe('/api/cron/checkin-process', () => {
  it('405 on unsupported methods', async () => {
    const res = makeRes();
    await cronCheckinHandler(makeReq({ method: 'PATCH' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('401 with no auth', async () => {
    const res = makeRes();
    await cronCheckinHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('401 with wrong Bearer secret', async () => {
    const res = makeRes();
    await cronCheckinHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer wrong-secret' },
      }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('200 with correct Bearer secret runs the bulk processor', async () => {
    processCheckinForUpcomingMatches.mockResolvedValueOnce({
      scanned: 5,
      acted: 2,
      errors: 0,
      details: [] as any,
    });

    const res = makeRes();
    await cronCheckinHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer cron-test-secret' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scanned).toBe(5);
    expect((res.body as any).acted).toBe(2);
    expect(processCheckinForUpcomingMatches).toHaveBeenCalledOnce();
  });

  it('200 also accepts the secret via ?secret=… query param', async () => {
    const res = makeRes();
    await cronCheckinHandler(
      makeReq({
        method: 'GET',
        query: { secret: 'cron-test-secret' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('writes a heartbeat to site_settings on success', async () => {
    store.site_settings = [];
    const res = makeRes();
    await cronCheckinHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer cron-test-secret' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const heartbeat = (store.site_settings as any).find(
      (s: any) => s.key === 'last_cron_checkin_at'
    );
    expect(heartbeat).toBeTruthy();
    expect(typeof heartbeat.value).toBe('string');
  });

  it('500 when the bulk processor throws', async () => {
    processCheckinForUpcomingMatches.mockRejectedValueOnce(new Error('boom'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await cronCheckinHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer cron-test-secret' },
      }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });
});

/* -----------------------------------------------------------
 * /api/news/comments
 * ---------------------------------------------------------*/

describe('/api/news/comments', () => {
  function freshCaptcha(): { token: string; answer: number } {
    const ch = generateChallenge();
    // Solve the math question (format: "a OP b" with OP in {+, -, ×})
    const m = ch.question.match(/^(\d+)\s+([+\-×])\s+(\d+)$/)!;
    const a = Number(m[1]);
    const b = Number(m[3]);
    let answer = 0;
    if (m[2] === '+') answer = a + b;
    if (m[2] === '-') answer = a - b;
    if (m[2] === '×') answer = a * b;
    return { token: ch.token, answer };
  }

  it('GET 400 when newsId missing', async () => {
    const res = makeRes();
    await newsCommentsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('GET 200 returns comments for a news', async () => {
    store.news_comments = [
      {
        id: 'c1',
        news_id: 'n1',
        author_name: 'A',
        content: 'first',
        created_at: '2026-04-01',
      },
      {
        id: 'c2',
        news_id: 'n2',
        author_name: 'B',
        content: 'other',
        created_at: '2026-04-02',
      },
    ] as any;
    const res = makeRes();
    await newsCommentsHandler(
      makeReq({ method: 'GET', query: { newsId: 'n1' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items.map((i: any) => i.id)).toEqual(['c1']);
  });

  it('POST 400 with honeypot filled', async () => {
    const { token, answer } = freshCaptcha();
    const res = makeRes();
    await newsCommentsHandler(
      makeReq({
        method: 'POST',
        body: {
          newsId: 'n1',
          content: 'hello world',
          captchaToken: token,
          captchaAnswer: String(answer),
          honeypot: 'spam',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 with bad captcha', async () => {
    const res = makeRes();
    await newsCommentsHandler(
      makeReq({
        method: 'POST',
        body: {
          newsId: 'n1',
          content: 'hello world',
          captchaToken: 'invalid',
          captchaAnswer: '999',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when content too short', async () => {
    const { token, answer } = freshCaptcha();
    const res = makeRes();
    await newsCommentsHandler(
      makeReq({
        method: 'POST',
        body: {
          newsId: 'n1',
          content: 'hi',
          captchaToken: token,
          captchaAnswer: String(answer),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 inserts a valid comment', async () => {
    const { token, answer } = freshCaptcha();
    store.news_comments = [];
    const res = makeRes();
    await newsCommentsHandler(
      makeReq({
        method: 'POST',
        body: {
          newsId: 'n1',
          content: 'My first comment, hello!',
          authorName: '  Alice  ',
          captchaToken: token,
          captchaAnswer: String(answer),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(store.news_comments.length).toBe(1);
    expect((store.news_comments[0] as any).author_name).toBe('Alice');
  });
});

/* -----------------------------------------------------------
 * /api/support/ticket (public)
 * ---------------------------------------------------------*/

describe('POST /api/support/ticket', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await supportTicketHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid category', async () => {
    const res = makeRes();
    await supportTicketHandler(
      makeReq({
        method: 'POST',
        body: {
          category: 'bogus',
          severity: 'low',
          message: 'a longer message',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on invalid severity', async () => {
    const res = makeRes();
    await supportTicketHandler(
      makeReq({
        method: 'POST',
        body: {
          category: 'other',
          severity: 'bogus',
          message: 'a longer message',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on too-short message', async () => {
    const res = makeRes();
    await supportTicketHandler(
      makeReq({
        method: 'POST',
        body: { category: 'other', severity: 'low', message: 'short' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on too-long message', async () => {
    const res = makeRes();
    await supportTicketHandler(
      makeReq({
        method: 'POST',
        body: {
          category: 'other',
          severity: 'low',
          message: 'a'.repeat(5001),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on invalid tournamentId', async () => {
    const res = makeRes();
    await supportTicketHandler(
      makeReq({
        method: 'POST',
        body: {
          category: 'other',
          severity: 'low',
          message: 'a longer message',
          tournamentId: 'bogus',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when non-anonymous and email missing', async () => {
    const res = makeRes();
    await supportTicketHandler(
      makeReq({
        method: 'POST',
        body: {
          category: 'dispute',
          severity: 'medium',
          message: 'a longer message',
          isAnonymous: false,
          name: 'Alice',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('201 anonymous ticket: inserts + Discord ping + staff email', async () => {
    store.support_tickets = [];
    const res = makeRes();
    await supportTicketHandler(
      makeReq({
        method: 'POST',
        body: {
          tournamentId: TID,
          category: 'behavior',
          severity: 'medium',
          message: 'A longer message about an issue',
          isAnonymous: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(store.support_tickets.length).toBe(1);

    await new Promise((r) => setImmediate(r));
    expect(notifySupportTicket).toHaveBeenCalledOnce();
    // Anonymous → confirmation email NOT sent, but staff email IS sent
    expect(sendSupportConfirmationEmail).not.toHaveBeenCalled();
    expect(sendSupportStaffNotificationEmail).toHaveBeenCalledOnce();
  });

  it('201 non-anonymous + email: sends confirmation email but skips staff (low severity)', async () => {
    store.support_tickets = [];
    const res = makeRes();
    await supportTicketHandler(
      makeReq({
        method: 'POST',
        body: {
          category: 'technical',
          severity: 'low',
          message: 'A longer message about an issue',
          isAnonymous: false,
          name: 'Alice',
          email: 'alice@example.com',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    await new Promise((r) => setImmediate(r));
    expect(sendSupportConfirmationEmail).toHaveBeenCalledOnce();
    expect(sendSupportStaffNotificationEmail).not.toHaveBeenCalled();
  });

  it('201 high-severity always notifies staff via email', async () => {
    store.support_tickets = [];
    const res = makeRes();
    await supportTicketHandler(
      makeReq({
        method: 'POST',
        body: {
          category: 'dispute',
          severity: 'high',
          message: 'High-priority issue here',
          isAnonymous: false,
          email: 'alice@example.com',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    await new Promise((r) => setImmediate(r));
    expect(sendSupportStaffNotificationEmail).toHaveBeenCalledOnce();
  });

  it('returns referenceShort that is the first 8 chars of the id', async () => {
    store.support_tickets = [];
    const res = makeRes();
    await supportTicketHandler(
      makeReq({
        method: 'POST',
        body: {
          category: 'other',
          severity: 'low',
          message: 'A longer message about an issue',
          isAnonymous: true,
        },
      }),
      res
    );
    const body = res.body as any;
    expect(body.referenceShort).toBe(body.ticketId.slice(0, 8));
  });
});
