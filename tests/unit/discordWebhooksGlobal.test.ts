// Tests pour les endpoints globaux des webhooks Discord :
//  - pages/api/admin/site-settings/discord-webhooks.ts (CRUD globals)
//  - pages/api/admin/site-settings/discord-test.ts     (test webhook global)
//
// Ces endpoints exposent la config "maitre" qui sert de fallback automatique
// quand un tournoi n'a pas declare son propre webhook pour un channel donne.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { postToDiscordWebhook } = vi.hoisted(() => ({
  postToDiscordWebhook: vi.fn(async () => undefined),
}));

vi.mock('@/utils/discord', () => ({ postToDiscordWebhook }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import discordWebhooksHandler from '../../pages/api/admin/site-settings/discord-webhooks';
import discordTestHandler from '../../pages/api/admin/site-settings/discord-test';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
): StaffMember {
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

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
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

const VALID_DISCORD_URL = 'https://discord.com/api/webhooks/123/abc';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  postToDiscordWebhook.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * GET /api/admin/site-settings/discord-webhooks
 * ---------------------------------------------------------*/

describe('GET /api/admin/site-settings/discord-webhooks', () => {
  it('returns only global webhooks (tournament_id IS NULL)', async () => {
    store.discord_webhooks = [
      {
        id: 'w-global',
        tournament_id: null,
        channel_type: 'match_results',
        webhook_url: VALID_DISCORD_URL,
        role_mention: null,
        is_active: true,
      },
      {
        id: 'w-scoped',
        tournament_id: 'tour-1',
        channel_type: 'match_results',
        webhook_url: 'https://discord.com/api/webhooks/sc/xyz',
        role_mention: null,
        is_active: true,
      },
    ] as any;

    const res = makeRes();
    await discordWebhooksHandler(makeAuthedReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.globals.length).toBe(1);
    expect(body.globals[0].id).toBe('w-global');
    expect(body.channelTypes).toBeDefined();
    expect(Array.isArray(body.channelTypes)).toBe(true);
  });

  it('returns empty list when no globals configured', async () => {
    const res = makeRes();
    await discordWebhooksHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).globals).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * PUT /api/admin/site-settings/discord-webhooks
 * ---------------------------------------------------------*/

describe('PUT /api/admin/site-settings/discord-webhooks', () => {
  it('rejects an invalid channelType', async () => {
    const res = makeRes();
    await discordWebhooksHandler(
      makeAuthedReq({
        method: 'PUT',
        body: { channelType: 'unknown', webhookUrl: VALID_DISCORD_URL },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-Discord URL', async () => {
    const res = makeRes();
    await discordWebhooksHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          channelType: 'match_results',
          webhookUrl: 'https://evil.example.com/hook',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('inserts a new global webhook (no existing row)', async () => {
    const res = makeRes();
    await discordWebhooksHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          channelType: 'mvp_polls',
          webhookUrl: VALID_DISCORD_URL,
          roleMention: '1234567890',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const rows = store.discord_webhooks as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].tournament_id).toBeNull();
    expect(rows[0].channel_type).toBe('mvp_polls');
    expect(rows[0].webhook_url).toBe(VALID_DISCORD_URL);
    expect(rows[0].role_mention).toBe('1234567890');
  });

  it('updates the existing global webhook for a given channel_type', async () => {
    store.discord_webhooks = [
      {
        id: 'existing',
        tournament_id: null,
        channel_type: 'match_results',
        webhook_url: 'https://discord.com/api/webhooks/old/xyz',
        role_mention: null,
        is_active: true,
      },
    ] as any;
    const res = makeRes();
    await discordWebhooksHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          channelType: 'match_results',
          webhookUrl: VALID_DISCORD_URL,
          isActive: false,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const rows = store.discord_webhooks as any[];
    // Toujours 1 row (update, pas insert)
    expect(rows.length).toBe(1);
    expect(rows[0].webhook_url).toBe(VALID_DISCORD_URL);
    expect(rows[0].is_active).toBe(false);
  });

  it('writes a staff_log entry tagging scope=global', async () => {
    const res = makeRes();
    await discordWebhooksHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          channelType: 'bracket_updates',
          webhookUrl: VALID_DISCORD_URL,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const logs = store.staff_logs as any[];
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('update_discord_webhook');
    expect(logs[0].entity_type).toBe('site_settings');
    expect(logs[0].payload.scope).toBe('global');
  });
});

/* -----------------------------------------------------------
 * DELETE /api/admin/site-settings/discord-webhooks
 * ---------------------------------------------------------*/

describe('DELETE /api/admin/site-settings/discord-webhooks', () => {
  it('rejects an invalid channelType', async () => {
    const res = makeRes();
    await discordWebhooksHandler(
      makeAuthedReq({
        method: 'DELETE',
        query: { channelType: 'bogus' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('removes only the global row, leaves scoped rows alone', async () => {
    store.discord_webhooks = [
      {
        id: 'w-global',
        tournament_id: null,
        channel_type: 'match_results',
        webhook_url: VALID_DISCORD_URL,
        role_mention: null,
        is_active: true,
      },
      {
        id: 'w-scoped',
        tournament_id: 'tour-1',
        channel_type: 'match_results',
        webhook_url: 'https://discord.com/api/webhooks/sc/xyz',
        role_mention: null,
        is_active: true,
      },
    ] as any;
    const res = makeRes();
    await discordWebhooksHandler(
      makeAuthedReq({
        method: 'DELETE',
        query: { channelType: 'match_results' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const rows = store.discord_webhooks as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('w-scoped');
  });
});

/* -----------------------------------------------------------
 * POST /api/admin/site-settings/discord-test
 * ---------------------------------------------------------*/

describe('POST /api/admin/site-settings/discord-test', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await discordTestHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid channelType', async () => {
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({ method: 'POST', body: { channelType: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when no global webhook configured', async () => {
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({
        method: 'POST',
        body: { channelType: 'match_results' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(postToDiscordWebhook).not.toHaveBeenCalled();
  });

  it('ignores tournament-scoped webhooks (only globals count)', async () => {
    store.discord_webhooks = [
      {
        id: 'w-scoped',
        tournament_id: 'tour-1',
        channel_type: 'match_results',
        webhook_url: VALID_DISCORD_URL,
        role_mention: null,
        is_active: true,
      },
    ] as any;
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({
        method: 'POST',
        body: { channelType: 'match_results' },
      }),
      res
    );
    // Pas de global = 404, le scoped doit etre ignore par cet endpoint
    expect(res.statusCode).toBe(404);
    expect(postToDiscordWebhook).not.toHaveBeenCalled();
  });

  it('200 and posts to Discord when a global webhook is configured', async () => {
    store.discord_webhooks = [
      {
        id: 'w-global',
        tournament_id: null,
        channel_type: 'match_results',
        webhook_url: VALID_DISCORD_URL,
        role_mention: null,
        is_active: true,
      },
    ] as any;
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({
        method: 'POST',
        body: { channelType: 'match_results' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(postToDiscordWebhook).toHaveBeenCalledOnce();
    expect(postToDiscordWebhook).toHaveBeenCalledWith(
      VALID_DISCORD_URL,
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            footer: expect.objectContaining({ text: expect.stringMatching(/global/i) }),
          }),
        ]),
      })
    );
  });

  it('skips inactive global webhooks (treated as not configured)', async () => {
    store.discord_webhooks = [
      {
        id: 'w-global-off',
        tournament_id: null,
        channel_type: 'match_results',
        webhook_url: VALID_DISCORD_URL,
        role_mention: null,
        is_active: false,
      },
    ] as any;
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({
        method: 'POST',
        body: { channelType: 'match_results' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(postToDiscordWebhook).not.toHaveBeenCalled();
  });
});
