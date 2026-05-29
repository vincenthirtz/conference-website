// tests/unit/apiBotTenantsAllConfigs.test.ts
//
// Tests pour GET /api/bot/v1/tenants/all-configs :
//   - 200 vide si aucun guild
//   - 200 avec tous les guilds + leur config (ou defauts vides si absent)

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
import handler from '../../pages/api/bot/v1/tenants/all-configs';

const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT_ID = 'aa11bb22-cc33-dd44-ee55-ff6677889900';
const GUILD_A = '1259186540001890474';
const GUILD_B = '9999999999999999999';

function makeReq(): any {
  return {
    method: 'GET',
    headers: { host: 'h', 'x-api-key': 'test-key' },
    query: {},
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

describe('GET /api/bot/v1/tenants/all-configs', () => {
  it('401 sans api key', async () => {
    const res = makeRes();
    await handler({ ...makeReq(), headers: { host: 'h' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('retourne configs vide si aucun guild', async () => {
    store.discord_guilds = [];
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).configs).toEqual([]);
  });

  it('retourne tous les guilds + config (defauts vides si pas de row)', async () => {
    store.discord_guilds = [
      {
        guild_id: GUILD_A,
        is_primary: true,
        tenant: {
          id: CONFERENCE_TENANT_ID,
          slug: 'conference',
          name: 'Conférence',
          is_active: true,
          default_locale: 'fr',
        },
      },
      {
        guild_id: GUILD_B,
        is_primary: false,
        tenant: {
          id: OTHER_TENANT_ID,
          slug: 'tournoi-x',
          name: 'Tournoi X',
          is_active: true,
          default_locale: 'fr',
        },
      },
    ] as any;
    store.tenant_discord_config = [
      {
        guild_id: GUILD_A,
        staff_log_channel_id: '111111111111111111',
        matches_live_channel_id: null,
        disputes_forum_channel_id: null,
        lives_board_channel_id: null,
        news_ingest_channel_id: null,
        scrims_announce_channel_id: null,
        captain_role_id: '222222222222222222',
        substitute_role_id: null,
        staff_role_owner_id: '777777777777777777',
        staff_role_admin_id: '888888888888888888',
        staff_role_manager_id: null,
        staff_role_caster_id: null,
        teams_voice_category_id: null,
        disputes_forum_tag_open_id: null,
        disputes_forum_tag_pending_id: null,
        disputes_forum_tag_resolved_id: null,
        extras: { foo: 'bar' },
      },
      // Pas de row pour GUILD_B → defauts.
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const configs = (res.body as any).configs as any[];
    expect(configs).toHaveLength(2);

    const a = configs.find((c) => c.guild.guild_id === GUILD_A);
    const b = configs.find((c) => c.guild.guild_id === GUILD_B);

    expect(a.tenant.slug).toBe('conference');
    expect(a.guild.is_primary).toBe(true);
    expect(a.discord_config.staff_log_channel_id).toBe('111111111111111111');
    expect(a.discord_config.captain_role_id).toBe('222222222222222222');
    expect(a.discord_config.staff_role_owner_id).toBe('777777777777777777');
    expect(a.discord_config.staff_role_admin_id).toBe('888888888888888888');
    expect(a.discord_config.staff_role_manager_id).toBeNull();
    expect(a.discord_config.extras).toEqual({ foo: 'bar' });
    // guild_id pas duplique dans discord_config.
    expect(a.discord_config).not.toHaveProperty('guild_id');

    expect(b.tenant.slug).toBe('tournoi-x');
    expect(b.guild.is_primary).toBe(false);
    // Defauts vides.
    expect(b.discord_config.staff_log_channel_id).toBeNull();
    expect(b.discord_config.staff_role_owner_id).toBeNull();
    expect(b.discord_config.staff_role_admin_id).toBeNull();
    expect(b.discord_config.staff_role_manager_id).toBeNull();
    expect(b.discord_config.staff_role_caster_id).toBeNull();
    expect(b.discord_config.extras).toEqual({});
  });
});
