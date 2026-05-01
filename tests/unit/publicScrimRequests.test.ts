import { describe, it, expect, vi, beforeEach } from 'vitest';

const { notifyScrimRequest } = vi.hoisted(() => ({
  notifyScrimRequest: vi.fn(async () => undefined),
}));
vi.mock('@/utils/discord', () => ({ notifyScrimRequest }));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import publicScrimHandler from '../../pages/api/public/scrim-requests';
import { generateChallenge } from '../../utils/captcha';

const TEAM_ID = '550e8400-e29b-41d4-a716-446655440100';

function makeReq(body: any = {}, method = 'POST'): any {
  return {
    method,
    headers: { host: 'h' },
    query: {},
    body,
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

function freshCaptcha(): { token: string; answer: number } {
  const ch = generateChallenge();
  const m = ch.question.match(/^(\d+)\s+([+\-×])\s+(\d+)$/)!;
  const a = Number(m[1]);
  const b = Number(m[3]);
  let answer = 0;
  if (m[2] === '+') answer = a + b;
  if (m[2] === '-') answer = a - b;
  if (m[2] === '×') answer = a * b;
  return { token: ch.token, answer };
}

function validBody(
  over: Record<string, unknown> = {}
): Record<string, unknown> {
  const c = freshCaptcha();
  return {
    targetTeamId: TEAM_ID,
    fromTeamName: 'Visitors',
    requesterName: 'Alice',
    requesterEmail: 'alice@example.com',
    captchaToken: c.token,
    captchaAnswer: String(c.answer),
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  store.teams = [{ id: TEAM_ID, name: 'Phoenix', is_active: true }];
  store.demandes = [];
  notifyScrimRequest.mockClear();
});

describe('POST /api/public/scrim-requests', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await publicScrimHandler(makeReq({}, 'GET'), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when honeypot is filled', async () => {
    const res = makeRes();
    await publicScrimHandler(makeReq(validBody({ honeypot: 'spam' })), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 with invalid captcha', async () => {
    const res = makeRes();
    await publicScrimHandler(
      makeReq(validBody({ captchaToken: 'invalid', captchaAnswer: '0' })),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 with malformed email', async () => {
    const res = makeRes();
    await publicScrimHandler(
      makeReq(validBody({ requesterEmail: 'not-an-email' })),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 with empty fromTeamName', async () => {
    const res = makeRes();
    await publicScrimHandler(makeReq(validBody({ fromTeamName: '' })), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 when targetTeamId missing and no slug', async () => {
    const res = makeRes();
    await publicScrimHandler(
      makeReq(validBody({ targetTeamId: undefined })),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when target team does not exist', async () => {
    const res = makeRes();
    await publicScrimHandler(
      makeReq(
        validBody({
          targetTeamId: '550e8400-e29b-41d4-a716-446655440999',
        })
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when preferred date is in the past', async () => {
    const res = makeRes();
    const past = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    await publicScrimHandler(makeReq(validBody({ preferredDate: past })), res);
    expect(res.statusCode).toBe(400);
  });

  it('201 inserts a demande with source=public and user_id=null', async () => {
    const res = makeRes();
    await publicScrimHandler(
      makeReq(validBody({ message: 'Hello, on est dispo ce week-end.' })),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(store.demandes.length).toBe(1);
    const inserted: any = store.demandes[0];
    expect(inserted.source).toBe('public');
    expect(inserted.user_id).toBe(null);
    expect(inserted.team_id).toBe(TEAM_ID);
    expect(inserted.type).toBe('scrim');
    expect(inserted.status).toBe('pending');
    expect(inserted.payload.requester_email).toBe('alice@example.com');
    expect(inserted.payload.requester_name).toBe('Alice');
    expect(inserted.payload.from_team_name).toBe('Visitors');
    expect(typeof inserted.payload.ip_hash).toBe('string');
    expect(notifyScrimRequest).toHaveBeenCalledTimes(1);
    const calls = notifyScrimRequest.mock.calls as unknown as Array<
      [{ isExternal?: boolean }]
    >;
    expect(calls[0]?.[0]?.isExternal).toBe(true);
  });

  it('409 when a pending request from same email to same team already exists', async () => {
    store.demandes = [
      {
        id: 'd1',
        team_id: TEAM_ID,
        type: 'scrim',
        status: 'pending',
        source: 'public',
        created_at: new Date().toISOString(),
        payload: { requester_email: 'alice@example.com' },
      },
    ];
    const res = makeRes();
    await publicScrimHandler(makeReq(validBody()), res);
    expect(res.statusCode).toBe(409);
    expect(notifyScrimRequest).not.toHaveBeenCalled();
  });
});
