// Le salon d'annonce des équipes qui recrutent — la CHAÎNE complète.
//
// Une colonne de `tenant_discord_config` ne sert à rien tant qu'elle n'existe
// pas AUX QUATRE ENDROITS : la base, la whitelist du PUT admin, les champs de
// l'écran, et le `select()` NOMMÉ des deux endpoints bot. Le précédent est
// documenté : `free_players_channel_id` a vécu des mois côté bot sans colonne
// ni whitelist — l'admin choisissait un salon, le PUT répondait 200, la valeur
// était jetée en silence, et onze inscriptions n'ont été annoncées à personne.
//
// Ces tests vérifient les maillons que le typage ne couvre pas : les deux
// `select()` sont des CHAÎNES de caractères (rien ne casse à la compilation si
// la colonne y manque), et l'écran admin est relié au PUT par une simple liste
// de clés.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import byGuildHandler from '../../pages/api/bot/v1/tenants/by-guild/[guildId]';
import allConfigsHandler from '../../pages/api/bot/v1/tenants/all-configs';
import {
  DISCORD_CONFIG_FIELD_KEYS,
  getDiscordConfigFields,
} from '../../utils/discord/discordConfigFields';

const GUILD_ID = '1259186540001890474';
const CHANNEL_ID = '1545536672064741406';

function makeReq(query: Record<string, string> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', 'x-api-key': 'test-key' },
    query,
    body: {},
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seedGuild() {
  store.discord_guilds = [
    {
      guild_id: GUILD_ID,
      is_primary: true,
      tenant_id: CONFERENCE_TENANT_ID,
      tenant: {
        id: CONFERENCE_TENANT_ID,
        slug: 'conference',
        name: 'Conférence',
        is_active: true,
        default_locale: 'fr',
      },
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  seedBotAuth();
});

describe('team_openings_channel_id — de l’écran admin jusqu’au bot', () => {
  it('l’écran admin propose le champ, donc le PUT doit l’accepter', () => {
    // Le garde-fou « tout champ de l'écran est dans la whitelist du PUT » vit
    // dans apiAdminTenants.test.ts ; ici on vérifie l'autre bout : que le champ
    // est bien PROPOSÉ, sinon la colonne reste inatteignable depuis l'admin.
    expect(DISCORD_CONFIG_FIELD_KEYS).toContain('team_openings_channel_id');

    const field = getDiscordConfigFields(
      new Proxy({} as any, { get: () => 'x' })
    ).find((f) => f.key === 'team_openings_channel_id');
    expect(field).toBeDefined();
    // Un salon texte, comme celui des joueuses libres — pas un forum, pas un
    // vocal : le sélecteur ne doit proposer que des salons où poster un embed.
    expect(field?.channelKind).toBe('text');
    expect(field?.section).toBe('channels');
  });

  it('by-guild relaie la valeur au bot', async () => {
    seedGuild();
    store.tenant_discord_config = [
      {
        guild_id: GUILD_ID,
        free_players_channel_id: '1111111111111111111',
        team_openings_channel_id: CHANNEL_ID,
        extras: {},
      },
    ] as any;

    const res = makeRes();
    await byGuildHandler(makeReq({ guildId: GUILD_ID }), res);

    expect(res.statusCode).toBe(200);
    // Le `select()` est une chaîne : sans la colonne dedans, cette clé serait
    // absente de la réponse et le bot n'annoncerait nulle part.
    expect((res.body as any).discord_config.team_openings_channel_id).toBe(
      CHANNEL_ID
    );
  });

  it('by-guild expose la clé même sans row de config', async () => {
    seedGuild();
    store.tenant_discord_config = [];

    const res = makeRes();
    await byGuildHandler(makeReq({ guildId: GUILD_ID }), res);

    expect(res.statusCode).toBe(200);
    // Contrat homogène : la clé existe toujours, à null. Le bot applique alors
    // son fallback plutôt que de lire `undefined`.
    expect((res.body as any).discord_config).toHaveProperty(
      'team_openings_channel_id',
      null
    );
  });

  it('all-configs relaie la valeur au bot', async () => {
    seedGuild();
    store.tenant_discord_config = [
      {
        guild_id: GUILD_ID,
        team_openings_channel_id: CHANNEL_ID,
        extras: {},
      },
    ] as any;

    const res = makeRes();
    await allConfigsHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const configs = (res.body as any).configs as any[];
    expect(configs).toHaveLength(1);
    expect(configs[0].discord_config.team_openings_channel_id).toBe(CHANNEL_ID);
  });
});
