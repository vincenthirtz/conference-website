// tests/unit/blacklistHelper.test.ts
//
// Feature Blacklist joueurs — Lot 1 (helper checkBlacklist).
// Ref: utils/moderation/blacklist.ts.
//
//   - Match FORT sur battle_tag (insensible casse/espaces) et discord_user_id.
//   - Match SOFT sur display_name (insensible casse).
//   - Pas de match sur l'email (champ ignoré : pas de critère email).
//   - Agrège matched/entries avec strength correct + dédupe par id (strong>soft).
//   - Robustesse : erreur DB simulée → { matched:false, entries:[] } sans throw.
//
// NOTE mock : `.or(...)` est un no-op dans le mock supabase ; checkBlacklist
// filtre tenant_id + active via `.eq(...)` (réellement implémenté) puis raffine
// le matching en JS. C'est donc bien la logique JS du helper qui est exercée.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

// emitBotEvent n'est pas exercé par checkBlacklist mais le module l'importe.
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => undefined),
}));

import {
  store,
  resetSupabaseMock,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { checkBlacklist } from '../../utils/moderation/blacklist';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ID_BT = '11111111-1111-4111-8111-111111111111';
const ID_DISCORD = '22222222-2222-4222-8222-222222222222';
const ID_NAME = '33333333-3333-4333-8333-333333333333';

function seed() {
  store.player_blacklist = [
    {
      id: ID_BT,
      tenant_id: TENANT,
      battle_tag: 'cheater#1234',
      display_name: null,
      discord_user_id: null,
      reason: 'aimbot',
      active: true,
    },
    {
      id: ID_DISCORD,
      tenant_id: TENANT,
      battle_tag: null,
      display_name: null,
      discord_user_id: '123456789012345678',
      reason: 'ban discord',
      active: true,
    },
    {
      id: ID_NAME,
      tenant_id: TENANT,
      battle_tag: null,
      display_name: 'SmurfPlayer',
      discord_user_id: null,
      reason: 'smurf suspecté',
      active: true,
    },
    // Entrée inactive : ne doit jamais matcher.
    {
      id: '44444444-4444-4444-8444-444444444444',
      tenant_id: TENANT,
      battle_tag: 'oldban#9',
      display_name: null,
      discord_user_id: null,
      reason: null,
      active: false,
    },
    // Entrée d'un autre tenant : ne doit jamais matcher.
    {
      id: '55555555-5555-4555-8555-555555555555',
      tenant_id: OTHER_TENANT,
      battle_tag: 'cheater#1234',
      display_name: null,
      discord_user_id: null,
      reason: null,
      active: true,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  seed();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('checkBlacklist — match fort battle_tag', () => {
  it('matche battle_tag insensible à la casse et aux espaces (strong)', async () => {
    const r = await checkBlacklist(supabaseAdmin as any, TENANT, {
      battleTag: '  Cheater#1234  ',
    });
    expect(r.matched).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      id: ID_BT,
      matchedOn: 'battle_tag',
      strength: 'strong',
      reason: 'aimbot',
    });
  });

  it('scope par tenant : pour TENANT, une seule entrée matche (pas celle de OTHER_TENANT)', async () => {
    // Deux entrées portent battle_tag 'cheater#1234' (une par tenant). Scopé
    // sur TENANT, seule ID_BT remonte — l'entrée OTHER_TENANT est exclue.
    const r = await checkBlacklist(supabaseAdmin as any, TENANT, {
      battleTag: 'cheater#1234',
    });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].id).toBe(ID_BT);
  });

  it('matche l’entrée de OTHER_TENANT seulement quand on scope dessus', async () => {
    const r = await checkBlacklist(supabaseAdmin as any, OTHER_TENANT, {
      battleTag: 'cheater#1234',
    });
    expect(r.matched).toBe(true);
    expect(r.entries.every((e) => e.id !== ID_BT)).toBe(true);
  });
});

describe('checkBlacklist — match fort discord_user_id', () => {
  it('matche discord_user_id en égalité exacte (strong)', async () => {
    const r = await checkBlacklist(supabaseAdmin as any, TENANT, {
      discordUserId: '123456789012345678',
    });
    expect(r.matched).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      id: ID_DISCORD,
      matchedOn: 'discord_user_id',
      strength: 'strong',
    });
  });
});

describe('checkBlacklist — match soft display_name', () => {
  it('matche display_name insensible à la casse (soft)', async () => {
    const r = await checkBlacklist(supabaseAdmin as any, TENANT, {
      displayName: 'smurfplayer',
    });
    expect(r.matched).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      id: ID_NAME,
      matchedOn: 'display_name',
      strength: 'soft',
    });
  });
});

describe('checkBlacklist — pas de critère email', () => {
  it('ignore complètement l’email (aucun match, pas de query inutile)', async () => {
    const r = await checkBlacklist(supabaseAdmin as any, TENANT, {
      // @ts-expect-error : email n'est pas un champ de BlacklistInput.
      email: 'cheater@example.com',
    });
    expect(r.matched).toBe(false);
    expect(r.entries).toEqual([]);
  });
});

describe('checkBlacklist — agrégation / dédupe', () => {
  it('renvoie plusieurs entrées quand plusieurs critères matchent des rows différentes', async () => {
    const r = await checkBlacklist(supabaseAdmin as any, TENANT, {
      battleTag: 'cheater#1234',
      discordUserId: '123456789012345678',
      displayName: 'SmurfPlayer',
    });
    expect(r.matched).toBe(true);
    const byId = Object.fromEntries(r.entries.map((e) => [e.id, e]));
    expect(byId[ID_BT].strength).toBe('strong');
    expect(byId[ID_DISCORD].strength).toBe('strong');
    expect(byId[ID_NAME].strength).toBe('soft');
    expect(r.entries).toHaveLength(3);
  });

  it('dédupe par id en gardant le match le plus fort (strong > soft)', async () => {
    // Une seule row porte à la fois battle_tag (strong) et display_name (soft).
    store.player_blacklist = [
      {
        id: ID_BT,
        tenant_id: TENANT,
        battle_tag: 'dual#1',
        display_name: 'DualName',
        discord_user_id: null,
        reason: null,
        active: true,
      },
    ] as any;
    const r = await checkBlacklist(supabaseAdmin as any, TENANT, {
      battleTag: 'dual#1',
      displayName: 'DualName',
    });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      id: ID_BT,
      matchedOn: 'battle_tag',
      strength: 'strong',
    });
  });

  it('aucun critère exploitable → matched:false sans query', async () => {
    const r = await checkBlacklist(supabaseAdmin as any, TENANT, {
      battleTag: '   ',
      displayName: '',
      discordUserId: null,
    });
    expect(r.matched).toBe(false);
    expect(r.entries).toEqual([]);
  });
});

describe('checkBlacklist — robustesse erreur DB', () => {
  it('erreur de query → { matched:false, entries:[] } sans throw', async () => {
    const erroringAdmin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              or: () =>
                Promise.resolve({
                  data: null,
                  error: { message: 'boom: connection lost' },
                }),
            }),
          }),
        }),
      }),
    };
    const r = await checkBlacklist(erroringAdmin as any, TENANT, {
      battleTag: 'cheater#1234',
    });
    expect(r).toEqual({ matched: false, entries: [] });
  });

  it('exception inattendue dans la chaîne → { matched:false, entries:[] } sans throw', async () => {
    const throwingAdmin = {
      from: () => {
        throw new Error('unexpected');
      },
    };
    const r = await checkBlacklist(throwingAdmin as any, TENANT, {
      discordUserId: '123456789012345678',
    });
    expect(r).toEqual({ matched: false, entries: [] });
  });
});
