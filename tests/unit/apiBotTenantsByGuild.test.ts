// tests/unit/apiBotTenantsByGuild.test.ts
//
// Tests pour GET /api/bot/v1/tenants/by-guild/[guildId] :
//   - 400 si guildId invalide
//   - 404 si guild absent (code GUILD_NOT_LINKED)
//   - 200 avec discord_config a defaut (vide) si aucune row config
//   - 200 avec discord_config populee si row config presente

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/tenants/by-guild/[guildId]';

const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const GUILD_ID = '1259186540001890474';
const OTHER_GUILD_ID = '9999999999999999999';

function makeReq(query: Record<string, string>): any {
  return {
    method: 'GET',
    headers: { host: 'h', 'x-api-key': 'test-key' },
    query,
    body: {},
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
  // Per-tenant bot auth (crossTenant route still requires a valid x-api-key).
  seedBotAuth();
});

describe('GET /api/bot/v1/tenants/by-guild/[guildId]', () => {
  it('401 sans api key', async () => {
    const res = makeRes();
    await handler(
      { ...makeReq({ guildId: GUILD_ID }), headers: { host: 'h' } },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('400 si guildId absent', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_GUILD_ID');
  });

  it('400 si guildId malforme (non snowflake)', async () => {
    const res = makeRes();
    await handler(makeReq({ guildId: 'not-a-snowflake' }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_GUILD_ID');
  });

  it('404 GUILD_NOT_LINKED si guild absent', async () => {
    store.discord_guilds = [];
    const res = makeRes();
    await handler(makeReq({ guildId: OTHER_GUILD_ID }), res);
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('GUILD_NOT_LINKED');
    expect((res.body as any).guild_id).toBe(OTHER_GUILD_ID);
  });

  it('200 avec discord_config a defaut vide si pas de row config', async () => {
    store.discord_guilds = [
      {
        guild_id: GUILD_ID,
        is_primary: true,
        tenant: {
          id: CONFERENCE_TENANT_ID,
          slug: 'conference',
          name: 'Conférence',
          is_active: true,
          default_locale: 'fr',
        },
      },
    ] as any;
    store.tenant_discord_config = [];

    const res = makeRes();
    await handler(makeReq({ guildId: GUILD_ID }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.tenant.id).toBe(CONFERENCE_TENANT_ID);
    expect(body.tenant.slug).toBe('conference');
    expect(body.tenant.default_locale).toBe('fr');
    expect(body.guild.guild_id).toBe(GUILD_ID);
    expect(body.guild.is_primary).toBe(true);
    // Toutes les colonnes config a leur valeur par defaut.
    expect(body.discord_config.staff_log_channel_id).toBeNull();
    expect(body.discord_config.matches_live_channel_id).toBeNull();
    expect(body.discord_config.captain_role_id).toBeNull();
    expect(body.discord_config.staff_role_owner_id).toBeNull();
    expect(body.discord_config.staff_role_admin_id).toBeNull();
    expect(body.discord_config.staff_role_caster_id).toBeNull();
    expect(body.discord_config.extras).toEqual({});
  });

  it('200 avec discord_config populee si row config presente', async () => {
    store.discord_guilds = [
      {
        guild_id: GUILD_ID,
        is_primary: true,
        tenant: {
          id: CONFERENCE_TENANT_ID,
          slug: 'conference',
          name: 'Conférence',
          is_active: true,
          default_locale: 'fr',
        },
      },
    ] as any;
    store.tenant_discord_config = [
      {
        guild_id: GUILD_ID,
        staff_log_channel_id: '111111111111111111',
        matches_live_channel_id: '222222222222222222',
        disputes_forum_channel_id: null,
        broadcast_panel_channel_id: null,
        news_ingest_channel_id: null,
        scrims_announce_channel_id: null,
        captain_role_id: '333333333333333333',
        substitute_role_id: null,
        staff_role_owner_id: '555555555555555555',
        staff_role_admin_id: '666666666666666666',
        staff_role_caster_id: null,
        teams_voice_category_id: null,
        disputes_forum_tag_open_id: null,
        disputes_forum_tag_pending_id: null,
        disputes_forum_tag_resolved_id: null,
        extras: { mvp_emoji_id: '444' },
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq({ guildId: GUILD_ID }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.discord_config.staff_log_channel_id).toBe('111111111111111111');
    expect(body.discord_config.matches_live_channel_id).toBe(
      '222222222222222222'
    );
    expect(body.discord_config.captain_role_id).toBe('333333333333333333');
    expect(body.discord_config.staff_role_owner_id).toBe('555555555555555555');
    expect(body.discord_config.staff_role_admin_id).toBe('666666666666666666');
    expect(body.discord_config.staff_role_caster_id).toBeNull();
    expect(body.discord_config.extras).toEqual({ mvp_emoji_id: '444' });
  });

  it('normalise extras si NULL en DB', async () => {
    store.discord_guilds = [
      {
        guild_id: GUILD_ID,
        is_primary: true,
        tenant: {
          id: CONFERENCE_TENANT_ID,
          slug: 'conference',
          name: 'Conférence',
          is_active: true,
          default_locale: 'fr',
        },
      },
    ] as any;
    store.tenant_discord_config = [
      {
        guild_id: GUILD_ID,
        staff_log_channel_id: null,
        matches_live_channel_id: null,
        disputes_forum_channel_id: null,
        broadcast_panel_channel_id: null,
        news_ingest_channel_id: null,
        scrims_announce_channel_id: null,
        captain_role_id: null,
        substitute_role_id: null,
        staff_role_owner_id: null,
        staff_role_admin_id: null,
        staff_role_caster_id: null,
        teams_voice_category_id: null,
        disputes_forum_tag_open_id: null,
        disputes_forum_tag_pending_id: null,
        disputes_forum_tag_resolved_id: null,
        extras: null,
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq({ guildId: GUILD_ID }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.discord_config.staff_role_owner_id).toBeNull();
    expect(body.discord_config.staff_role_admin_id).toBeNull();
    expect(body.discord_config.extras).toEqual({});
  });
});
