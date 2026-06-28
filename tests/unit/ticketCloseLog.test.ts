// tests/unit/ticketCloseLog.test.ts
//
// POST /api/bot/v1/tickets/close-log — résolution du closer Discord -> compte
// site, écriture conditionnelle d'une row staff_logs (action 'ticket_closed').

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
// Maintenance mode off (writes allowed).
vi.mock('@/utils/maintenance', () => ({
  isBotMaintenanceMode: vi.fn(async () => false),
}));

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import closeLogHandler from '../../pages/api/bot/v1/tickets/close-log';

// Discord snowflakes (15-25 digits).
const D_CLOSER = '100000000000000010';
const D_OPENER = '100000000000000011';
const D_CLAIMER = '100000000000000012';
const D_UNLINKED = '100000000000000013';

const U_CLOSER = 'aaaaaaaa-0000-0000-0000-000000000010';

function makeBotReq(over: Partial<any> = {}, method = 'POST'): any {
  return {
    method,
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
    },
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
  seedBotAuth();
  store.user_discord_links = [
    {
      auth_user_id: U_CLOSER,
      discord_user_id: D_CLOSER,
      discord_username: 'closer',
    },
  ] as any;
  store.staff_logs = [] as any;
});

describe('POST /api/bot/v1/tickets/close-log', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await closeLogHandler(
      {
        ...makeBotReq({
          body: {
            closedByDiscordId: D_CLOSER,
            number: 1,
            category: 'support',
            openerDiscordId: D_OPENER,
          },
        }),
        headers: { host: 'h' },
      },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('400 on bad body (missing required fields)', async () => {
    const res = makeRes();
    await closeLogHandler(
      makeBotReq({ body: { closedByDiscordId: D_CLOSER } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on invalid discord id', async () => {
    const res = makeRes();
    await closeLogHandler(
      makeBotReq({
        body: {
          closedByDiscordId: 'not-a-snowflake',
          number: 1,
          category: 'support',
          openerDiscordId: D_OPENER,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('linked closer → logged:true + a staff_logs row with action ticket_closed and the payload', async () => {
    const res = makeRes();
    await closeLogHandler(
      makeBotReq({
        body: {
          closedByDiscordId: D_CLOSER,
          number: 42,
          category: 'support',
          openerDiscordId: D_OPENER,
          claimedByDiscordId: D_CLAIMER,
          messageCount: 17,
          channelName: 'ticket-0042',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ logged: true });

    const logs = store.staff_logs as any[];
    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(log.staff_id).toBe(U_CLOSER);
    expect(log.action).toBe('ticket_closed');
    expect(log.entity_type).toBe('ticket');
    expect(log.entity_id).toBe('42');
    expect(log.payload).toEqual({
      category: 'support',
      openerDiscordId: D_OPENER,
      claimedByDiscordId: D_CLAIMER,
      messageCount: 17,
      channelName: 'ticket-0042',
      via: 'discord_bot',
    });
  });

  it('linked closer with omitted optionals → payload carries explicit nulls', async () => {
    const res = makeRes();
    await closeLogHandler(
      makeBotReq({
        body: {
          closedByDiscordId: D_CLOSER,
          number: 7,
          category: 'recrutement',
          openerDiscordId: D_OPENER,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ logged: true });

    const log = (store.staff_logs as any[])[0];
    expect(log.payload).toEqual({
      category: 'recrutement',
      openerDiscordId: D_OPENER,
      claimedByDiscordId: null,
      messageCount: null,
      channelName: null,
      via: 'discord_bot',
    });
  });

  it('unlinked closer → logged:false + no staff_logs row written', async () => {
    const res = makeRes();
    await closeLogHandler(
      makeBotReq({
        body: {
          closedByDiscordId: D_UNLINKED,
          number: 99,
          category: 'support',
          openerDiscordId: D_OPENER,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ logged: false });
    expect(store.staff_logs).toHaveLength(0);
  });
});
