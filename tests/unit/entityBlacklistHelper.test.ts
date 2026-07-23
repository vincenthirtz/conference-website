// tests/unit/entityBlacklistHelper.test.ts
//
// Feature Blacklist entités (équipes / structures-assos).
// Ref: utils/moderation/entityBlacklist.ts.
//
//   - Match FORT sur égalité exacte (insensible casse / espaces multiples).
//   - Match SOFT par inclusion dans un sens OU l'autre (nom stocké normalisé
//     d'au moins 4 caractères).
//   - Seuil : nom stocké < 4 chars → jamais de soft (l'exact reste possible).
//   - Agrège matched/entries + dédupe par id (strong > soft).
//   - Robustesse : erreur DB simulée → { matched:false, entries:[] } sans throw.
//   - alertIfEntityBlacklisted : UN event outbox agrégé, PAS d'insert
//     blacklist_alerts (table spécifique joueurs).
//
// NOTE mock : checkEntityBlacklist filtre tenant_id + active via `.eq(...)`
// (réellement implémenté dans le mock supabase) puis matche EN JS. C'est donc
// bien la logique JS du helper qui est exercée.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { emitBotEventMock } = vi.hoisted(() => ({
  emitBotEventMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: emitBotEventMock,
}));

import {
  store,
  resetSupabaseMock,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import {
  checkEntityBlacklist,
  alertIfEntityBlacklisted,
} from '../../utils/moderation/entityBlacklist';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ID_TEAM = '11111111-1111-4111-8111-111111111111';
const ID_ORG = '22222222-2222-4222-8222-222222222222';
const ID_SHORT = '33333333-3333-4333-8333-333333333333';

function seed() {
  store.entity_blacklist = [
    {
      id: ID_TEAM,
      tenant_id: TENANT,
      entity_type: 'team',
      name: 'Toxic Squad',
      reason: 'multi-comptes',
      active: true,
    },
    {
      id: ID_ORG,
      tenant_id: TENANT,
      entity_type: 'org',
      name: 'XYZ Org',
      reason: 'structure bannie',
      active: true,
    },
    // Nom stocké < 4 chars (normalisé) : jamais de soft, exact seulement.
    {
      id: ID_SHORT,
      tenant_id: TENANT,
      entity_type: 'team',
      name: 'abc',
      reason: null,
      active: true,
    },
    // Entrée inactive : ne doit jamais matcher.
    {
      id: '44444444-4444-4444-8444-444444444444',
      tenant_id: TENANT,
      entity_type: 'team',
      name: 'Old Banned Team',
      reason: null,
      active: false,
    },
    // Entrée d'un autre tenant : ne doit jamais matcher.
    {
      id: '55555555-5555-4555-8555-555555555555',
      tenant_id: OTHER_TENANT,
      entity_type: 'team',
      name: 'Toxic Squad',
      reason: null,
      active: true,
    },
  ] as any;
  store.blacklist_alerts = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  seed();
  emitBotEventMock.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/* ===========================================================================
 * checkEntityBlacklist — match exact (strong)
 * =========================================================================*/

describe('checkEntityBlacklist — match exact (strong)', () => {
  it('matche en insensible à la casse et aux espaces multiples (strong)', async () => {
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      TENANT,
      '  toxic   SQUAD  '
    );
    expect(r.matched).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      id: ID_TEAM,
      entityType: 'team',
      matchedName: 'Toxic Squad',
      strength: 'strong',
      reason: 'multi-comptes',
    });
  });

  it('scope par tenant : pour TENANT, une seule entrée matche (pas celle de OTHER_TENANT)', async () => {
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      TENANT,
      'Toxic Squad'
    );
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].id).toBe(ID_TEAM);
  });

  it('matche l’entrée de OTHER_TENANT seulement quand on scope dessus', async () => {
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      OTHER_TENANT,
      'Toxic Squad'
    );
    expect(r.matched).toBe(true);
    expect(r.entries.every((e) => e.id !== ID_TEAM)).toBe(true);
  });

  it('une entrée inactive ne matche jamais', async () => {
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      TENANT,
      'Old Banned Team'
    );
    expect(r.matched).toBe(false);
    expect(r.entries).toEqual([]);
  });
});

/* ===========================================================================
 * checkEntityBlacklist — match par inclusion (soft)
 * =========================================================================*/

describe('checkEntityBlacklist — inclusion (soft)', () => {
  it('nom stocké inclus dans le nom soumis → soft (« XYZ Org » ⊂ « XYZ Org Blue »)', async () => {
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      TENANT,
      'XYZ Org Blue'
    );
    expect(r.matched).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      id: ID_ORG,
      entityType: 'org',
      matchedName: 'XYZ Org',
      strength: 'soft',
      reason: 'structure bannie',
    });
  });

  it('nom soumis inclus dans le nom stocké → soft (« Toxic » ⊂ « Toxic Squad »)', async () => {
    const r = await checkEntityBlacklist(supabaseAdmin as any, TENANT, 'Toxic');
    expect(r.matched).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      id: ID_TEAM,
      strength: 'soft',
    });
  });

  it('inclusion insensible à la casse et aux espaces multiples', async () => {
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      TENANT,
      '  xyz    ORG   blue '
    );
    expect(r.matched).toBe(true);
    expect(r.entries[0]).toMatchObject({ id: ID_ORG, strength: 'soft' });
  });

  it('nom stocké < 4 chars : pas de soft par inclusion (« abc » ⊄ « abc blue »)', async () => {
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      TENANT,
      'abc blue'
    );
    expect(r.matched).toBe(false);
    expect(r.entries).toEqual([]);
  });

  it('nom stocké < 4 chars : l’égalité exacte reste un match strong', async () => {
    const r = await checkEntityBlacklist(supabaseAdmin as any, TENANT, ' ABC ');
    expect(r.matched).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ id: ID_SHORT, strength: 'strong' });
  });

  it('aucun match sur un nom sans rapport', async () => {
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      TENANT,
      'Fluffy Unicorns'
    );
    expect(r.matched).toBe(false);
    expect(r.entries).toEqual([]);
  });
});

/* ===========================================================================
 * checkEntityBlacklist — agrégation / dédupe / entrées vides
 * =========================================================================*/

describe('checkEntityBlacklist — agrégation / dédupe', () => {
  it('renvoie plusieurs entrées quand plusieurs rows matchent, avec la bonne force', async () => {
    // « Toxic Squad » exact (strong sur ID_TEAM) + une 2e entrée incluse.
    store.entity_blacklist = [
      ...(store.entity_blacklist as any[]),
      {
        id: '66666666-6666-4666-8666-666666666666',
        tenant_id: TENANT,
        entity_type: 'org',
        name: 'Squad',
        reason: null,
        active: true,
      },
    ] as any;
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      TENANT,
      'Toxic Squad'
    );
    expect(r.matched).toBe(true);
    const byId = Object.fromEntries(r.entries.map((e) => [e.id, e]));
    expect(byId[ID_TEAM].strength).toBe('strong');
    expect(byId['66666666-6666-4666-8666-666666666666'].strength).toBe('soft');
    expect(r.entries).toHaveLength(2);
  });

  it('dédupe par id : chaque entrée n’apparaît qu’une fois', async () => {
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      TENANT,
      'XYZ Org'
    );
    const ids = r.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nom vide / espaces → matched:false sans query', async () => {
    expect(
      await checkEntityBlacklist(supabaseAdmin as any, TENANT, '   ')
    ).toEqual({ matched: false, entries: [] });
    expect(
      await checkEntityBlacklist(supabaseAdmin as any, TENANT, null)
    ).toEqual({ matched: false, entries: [] });
    expect(
      await checkEntityBlacklist(supabaseAdmin as any, TENANT, undefined)
    ).toEqual({ matched: false, entries: [] });
  });

  it('tenant vide → matched:false sans query', async () => {
    const r = await checkEntityBlacklist(supabaseAdmin as any, '', 'Toxic');
    expect(r).toEqual({ matched: false, entries: [] });
  });
});

/* ===========================================================================
 * checkEntityBlacklist — robustesse erreur DB
 * =========================================================================*/

describe('checkEntityBlacklist — robustesse erreur DB', () => {
  it('erreur de query → { matched:false, entries:[] } sans throw', async () => {
    const erroringAdmin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () =>
                Promise.resolve({
                  data: null,
                  error: { message: 'boom: connection lost' },
                }),
            }),
          }),
        }),
      }),
    };
    const r = await checkEntityBlacklist(
      erroringAdmin as any,
      TENANT,
      'Toxic Squad'
    );
    expect(r).toEqual({ matched: false, entries: [] });
  });

  it('exception inattendue dans la chaîne → { matched:false, entries:[] } sans throw', async () => {
    const throwingAdmin = {
      from: () => {
        throw new Error('unexpected');
      },
    };
    const r = await checkEntityBlacklist(
      throwingAdmin as any,
      TENANT,
      'Toxic Squad'
    );
    expect(r).toEqual({ matched: false, entries: [] });
  });
});

/* ===========================================================================
 * alertIfEntityBlacklisted — event agrégé, pas d'insert blacklist_alerts
 * =========================================================================*/

describe('alertIfEntityBlacklisted — event outbox agrégé', () => {
  it('émet UN event registration.entity_blacklisted avec le match le plus fort', async () => {
    // Deux rows matchent : exact strong (ID_TEAM) + inclusion soft.
    store.entity_blacklist = [
      ...(store.entity_blacklist as any[]),
      {
        id: '66666666-6666-4666-8666-666666666666',
        tenant_id: TENANT,
        entity_type: 'org',
        name: 'Squad',
        reason: null,
        active: true,
      },
    ] as any;

    await alertIfEntityBlacklisted(
      supabaseAdmin as any,
      TENANT,
      'team_create',
      {
        name: '  Toxic   Squad ',
      }
    );

    expect(emitBotEventMock).toHaveBeenCalledTimes(1);
    const [eventName, payload, tenantId] = emitBotEventMock.mock
      .calls[0] as unknown[];
    expect(eventName).toBe('registration.entity_blacklisted');
    expect(tenantId).toBe(TENANT);
    expect(payload).toMatchObject({
      context: 'team_create',
      entityName: 'Toxic   Squad',
      matchedOn: 'name',
      // Représentant = match le plus fort (strong sur ID_TEAM).
      entityType: 'team',
      matchedName: 'Toxic Squad',
      strength: 'strong',
      reason: 'multi-comptes',
      matchCount: 2,
    });
    const matches = (payload as any).matches as any[];
    expect(matches).toHaveLength(2);
    expect(matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ID_TEAM, strength: 'strong' }),
        expect.objectContaining({
          id: '66666666-6666-4666-8666-666666666666',
          strength: 'soft',
        }),
      ])
    );
  });

  it('n’émet PAS d’event quand aucun match', async () => {
    await alertIfEntityBlacklisted(
      supabaseAdmin as any,
      TENANT,
      'team_create',
      {
        name: 'Fluffy Unicorns',
      }
    );
    expect(emitBotEventMock).not.toHaveBeenCalled();
  });

  it('n’insère JAMAIS dans blacklist_alerts (table spécifique joueurs)', async () => {
    await alertIfEntityBlacklisted(
      supabaseAdmin as any,
      TENANT,
      'team_create',
      {
        name: 'Toxic Squad',
      }
    );
    expect(emitBotEventMock).toHaveBeenCalledTimes(1);
    // L'event outbox EST l'alerte — aucune row blacklist_alerts.
    expect(store.blacklist_alerts as any[]).toHaveLength(0);
  });

  it('erreur DB pendant le check → résout sans rejeter et sans event', async () => {
    const throwingAdmin = {
      from: () => {
        throw new Error('boom');
      },
    };
    await expect(
      alertIfEntityBlacklisted(throwingAdmin as any, TENANT, 'team_create', {
        name: 'Toxic Squad',
      })
    ).resolves.toBeUndefined();
    expect(emitBotEventMock).not.toHaveBeenCalled();
  });

  it('erreur d’émission d’event → avalée (pas de rejet)', async () => {
    emitBotEventMock.mockRejectedValueOnce(new Error('outbox down') as never);
    await expect(
      alertIfEntityBlacklisted(supabaseAdmin as any, TENANT, 'team_create', {
        name: 'Toxic Squad',
      })
    ).resolves.toBeUndefined();
  });
});
