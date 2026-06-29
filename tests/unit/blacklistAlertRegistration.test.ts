// tests/unit/blacklistAlertRegistration.test.ts
//
// Feature Blacklist joueurs — persistance des détections côté inscription site.
// Ref: utils/moderation/blacklist.ts → alertIfBlacklisted().
//
// alertIfBlacklisted() émet l'event outbox `registration.blacklisted` puis,
// best-effort, insère une row `blacklist_alerts` (source='registration') :
//   - insert avec le bon mapping (match le plus fort, criteria agrégés, context)
//     quand il y a match ET un discord_user_id.
//   - PAS d'insert si l'input ne fournit pas de discord_user_id (la table exige
//     la colonne ; l'event outbox reste l'alerte).
//   - PAS d'insert s'il n'y a aucun match.
//   - si l'insert `blacklist_alerts` throw → l'erreur est avalée (l'inscription
//     ne doit JAMAIS échouer) : la fonction résout sans rejeter.
//
// NOTE mock : `@/utils/supabase` est auto-mocké par testSetup.ts. checkBlacklist
// filtre tenant_id + active via `.eq(...)` (réellement implémenté) puis raffine
// le matching en JS. emitBotEvent est mocké (pas le sujet ici).

import { describe, it, expect, beforeEach, vi } from 'vitest';

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
import { alertIfBlacklisted } from '../../utils/moderation/blacklist';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ID_BT = '11111111-1111-4111-8111-111111111111';
const ID_NAME = '33333333-3333-4333-8333-333333333333';
const BANNED_DISCORD = '123456789012345678';

/**
 * Seed une entrée FORTE (battle_tag) et une entrée SOFT (display_name) qui
 * matchent toutes deux l'input des tests → strongest = battle_tag (strong),
 * criteria = [battle_tag/strong, display_name/soft].
 */
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
      id: ID_NAME,
      tenant_id: TENANT,
      battle_tag: null,
      display_name: 'SmurfPlayer',
      discord_user_id: null,
      reason: 'smurf',
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
 * Insert sur match + discord_user_id présent
 * =========================================================================*/

describe('alertIfBlacklisted — insert blacklist_alerts (registration)', () => {
  it('insère une row source=registration avec le bon mapping quand match + discord_user_id', async () => {
    await alertIfBlacklisted(supabaseAdmin as any, TENANT, 'register', {
      battleTag: '  Cheater#1234  ',
      displayName: 'SmurfPlayer',
      discordUserId: BANNED_DISCORD,
    });

    const rows = store.blacklist_alerts as any[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.tenant_id).toBe(TENANT);
    expect(row.source).toBe('registration');
    expect(row.context).toBe('register');
    expect(row.discord_user_id).toBe(BANNED_DISCORD);
    // Match le plus fort = battle_tag (strong), porté par l'entrée ID_BT.
    expect(row.matched_on).toBe('battle_tag');
    expect(row.strength).toBe('strong');
    expect(row.blacklist_entry_id).toBe(ID_BT);
    expect(row.reason).toBe('aimbot');
    // battle_tag normalisé lowercase, display_name conservé.
    expect(row.battle_tag).toBe('cheater#1234');
    expect(row.display_name).toBe('SmurfPlayer');
    // criteria = liste complète des critères matchés.
    expect(row.criteria).toEqual(
      expect.arrayContaining([
        { matchedOn: 'battle_tag', strength: 'strong' },
        { matchedOn: 'display_name', strength: 'soft' },
      ])
    );
    expect(row.criteria).toHaveLength(2);

    // L'event outbox est toujours émis (l'insert est en plus, pas à la place).
    expect(emitBotEventMock).toHaveBeenCalledTimes(1);
    expect((emitBotEventMock.mock.calls[0] as unknown[])[0]).toBe(
      'registration.blacklisted'
    );
  });

  it('propage le bon context (team_create) dans la row', async () => {
    await alertIfBlacklisted(supabaseAdmin as any, TENANT, 'team_create', {
      battleTag: 'cheater#1234',
      discordUserId: BANNED_DISCORD,
    });
    const rows = store.blacklist_alerts as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].context).toBe('team_create');
  });
});

/* ===========================================================================
 * Pas d'insert
 * =========================================================================*/

describe('alertIfBlacklisted — pas d’insert', () => {
  it('aucun insert quand pas de discord_user_id (event outbox reste l’alerte)', async () => {
    await alertIfBlacklisted(supabaseAdmin as any, TENANT, 'register', {
      battleTag: 'cheater#1234',
      displayName: 'SmurfPlayer',
      // pas de discordUserId
    });

    expect(store.blacklist_alerts as any[]).toHaveLength(0);
    // L'event outbox est tout de même émis.
    expect(emitBotEventMock).toHaveBeenCalledTimes(1);
  });

  it('aucun insert ni event quand aucun match', async () => {
    await alertIfBlacklisted(supabaseAdmin as any, TENANT, 'register', {
      battleTag: 'inconnu#0000',
      discordUserId: BANNED_DISCORD,
    });
    expect(store.blacklist_alerts as any[]).toHaveLength(0);
    expect(emitBotEventMock).not.toHaveBeenCalled();
  });
});

/* ===========================================================================
 * Robustesse : l'insert ne doit jamais faire échouer l'inscription
 * =========================================================================*/

describe('alertIfBlacklisted — robustesse insert', () => {
  it('si l’insert blacklist_alerts throw → l’erreur est avalée (pas de rejet)', async () => {
    // Admin hybride : `player_blacklist` passe par le vrai mock (checkBlacklist
    // matche), mais `blacklist_alerts.insert(...)` throw. La fonction ne doit
    // PAS rejeter — l'inscription survit.
    const hybridAdmin = {
      from: (table: string) => {
        if (table === 'blacklist_alerts') {
          return {
            insert: () => {
              throw new Error('boom: insert blacklist_alerts failed');
            },
          };
        }
        return (supabaseAdmin as any).from(table);
      },
    };

    await expect(
      alertIfBlacklisted(hybridAdmin as any, TENANT, 'register', {
        battleTag: 'cheater#1234',
        discordUserId: BANNED_DISCORD,
      })
    ).resolves.toBeUndefined();

    // Aucune row écrite (l'insert a throw), mais l'event a bien été émis.
    expect(store.blacklist_alerts as any[]).toHaveLength(0);
    expect(emitBotEventMock).toHaveBeenCalledTimes(1);
  });

  it('si l’insert renvoie une error (sans throw) → avalée en warn, pas de rejet', async () => {
    const hybridAdmin = {
      from: (table: string) => {
        if (table === 'blacklist_alerts') {
          return {
            insert: () =>
              Promise.resolve({
                error: { message: 'duplicate key' },
              }),
          };
        }
        return (supabaseAdmin as any).from(table);
      },
    };

    await expect(
      alertIfBlacklisted(hybridAdmin as any, TENANT, 'register', {
        battleTag: 'cheater#1234',
        discordUserId: BANNED_DISCORD,
      })
    ).resolves.toBeUndefined();
    expect(emitBotEventMock).toHaveBeenCalledTimes(1);
  });
});
