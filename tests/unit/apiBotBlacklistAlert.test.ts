// tests/unit/apiBotBlacklistAlert.test.ts
//
// Feature Blacklist joueurs — persistance des détections bot (blacklist_alerts).
// Ref: pages/api/bot/v1/moderation/blacklist-alert.ts.
//
//   - POST → enregistre une détection blacklist rapportée par le bot Discord
//            (scan / arrivée d'un membre) dans la table `blacklist_alerts` via
//            supabaseAdmin, scopée tenant_id = req.botContext.tenantId.
//   - Happy path : 201 { alert: { id, createdAt } } + row insérée avec champs
//            mappés snake_case et tenant du botContext.
//   - Validation zod : matchedOn / strength / source hors enum, discordUserId
//            manquant → 400.
//   - Auth : sans x-api-key valide → 401 (withBotRoute).
//   - Idempotence : 2 POST avec la même Idempotency-Key + même body ne créent
//            qu'une row (réponse rejouée, header Idempotency-Replay).
//
// NOTE mock : `@/utils/supabase` et `@/utils/rateLimit` sont auto-mockés par
// tests/unit/__helpers__/testSetup.ts. L'auth bot par x-api-key passe par
// `tenant_secrets` seedé via seedBotAuth(). Le cache d'idempotency vit dans la
// table in-memory `bot_idempotency` (upsert), réinitialisé entre scénarios.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { __resetBotIdempotencyCache } from '../../utils/botAuth';
import handler from '../../pages/api/bot/v1/moderation/blacklist-alert';

const BLACKLIST_ENTRY_ID = '22222222-2222-4222-8222-2222222222aa';
const DISCORD_USER_ID = '123456789012345678';

function makeReq(over: Partial<any> = {}, method = 'POST'): any {
  return {
    method,
    url: '/api/bot/v1/moderation/blacklist-alert',
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
  res.end = () => res;
  return res;
}

/** Body POST valide minimal + surcharges. */
function validBody(over: Record<string, unknown> = {}) {
  return {
    discordUserId: DISCORD_USER_ID,
    battleTag: 'Cheater#1234',
    displayName: 'CheaterGuy',
    matchedOn: 'battle_tag',
    strength: 'strong',
    blacklistEntryId: BLACKLIST_ENTRY_ID,
    reason: 'aimbot',
    criteria: [
      { matchedOn: 'battle_tag', strength: 'strong' },
      { matchedOn: 'display_name', strength: 'soft' },
    ],
    source: 'bot_scan',
    context: 'guild-scan',
    ...over,
  };
}

beforeEach(async () => {
  resetSupabaseMock();
  await __resetBotIdempotencyCache();
  seedBotAuth();
  store.tenants = [{ id: CONFERENCE_TENANT_ID }] as any;
  store.blacklist_alerts = [] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * Auth
 * =========================================================================*/

describe('bot blacklist-alert auth', () => {
  it('401 sans api key', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
    expect(store.blacklist_alerts as any[]).toHaveLength(0);
  });
});

/* ===========================================================================
 * POST — happy path
 * =========================================================================*/

describe('POST /api/bot/v1/moderation/blacklist-alert', () => {
  it('201 → insère une alerte avec tenant du botContext + champs mappés', async () => {
    const res = makeRes();
    await handler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(201);
    const alert = (res.body as any).alert;
    expect(alert).toBeTruthy();
    expect(typeof alert.id).toBe('string');
    expect(alert).toHaveProperty('createdAt');

    const rows = store.blacklist_alerts as any[];
    expect(rows).toHaveLength(1);
    const row = rows.find((r) => r.id === alert.id);
    expect(row.tenant_id).toBe(CONFERENCE_TENANT_ID);
    expect(row.discord_user_id).toBe(DISCORD_USER_ID);
    expect(row.battle_tag).toBe('Cheater#1234');
    expect(row.display_name).toBe('CheaterGuy');
    expect(row.matched_on).toBe('battle_tag');
    expect(row.strength).toBe('strong');
    expect(row.blacklist_entry_id).toBe(BLACKLIST_ENTRY_ID);
    expect(row.reason).toBe('aimbot');
    expect(row.source).toBe('bot_scan');
    expect(row.context).toBe('guild-scan');
    expect(row.criteria).toEqual([
      { matchedOn: 'battle_tag', strength: 'strong' },
      { matchedOn: 'display_name', strength: 'soft' },
    ]);
  });

  it('201 → normalise les champs texte optionnels vides/absents en null', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          discordUserId: DISCORD_USER_ID,
          battleTag: '   ',
          matchedOn: 'discord_user_id',
          strength: 'soft',
          source: 'bot_member_add',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const rows = store.blacklist_alerts as any[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.battle_tag).toBeNull();
    expect(row.display_name).toBeNull();
    expect(row.reason).toBeNull();
    expect(row.context).toBeNull();
    expect(row.blacklist_entry_id).toBeNull();
    expect(row.criteria).toBeNull();
    expect(row.source).toBe('bot_member_add');
  });
});

/* ===========================================================================
 * POST — validation
 * =========================================================================*/

describe('POST blacklist-alert validation', () => {
  it('400 quand discordUserId manquant', async () => {
    const res = makeRes();
    const body = validBody();
    delete (body as any).discordUserId;
    await handler(makeReq({ body }), res);
    expect(res.statusCode).toBe(400);
    expect(store.blacklist_alerts as any[]).toHaveLength(0);
  });

  it('400 quand matchedOn hors enum', async () => {
    const res = makeRes();
    await handler(makeReq({ body: validBody({ matchedOn: 'email' }) }), res);
    expect(res.statusCode).toBe(400);
    expect(store.blacklist_alerts as any[]).toHaveLength(0);
  });

  it('400 quand strength hors enum', async () => {
    const res = makeRes();
    await handler(makeReq({ body: validBody({ strength: 'medium' }) }), res);
    expect(res.statusCode).toBe(400);
    expect(store.blacklist_alerts as any[]).toHaveLength(0);
  });

  it('400 quand source hors enum', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: validBody({ source: 'registration' }) }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(store.blacklist_alerts as any[]).toHaveLength(0);
  });

  it('400 quand blacklistEntryId n’est pas un uuid', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: validBody({ blacklistEntryId: 'not-a-uuid' }) }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(store.blacklist_alerts as any[]).toHaveLength(0);
  });
});

/* ===========================================================================
 * Idempotence
 * =========================================================================*/

describe('POST blacklist-alert idempotency', () => {
  it('2 POST même Idempotency-Key + même body → une seule row + réponse rejouée', async () => {
    const body = validBody();
    const headers = {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
      'idempotency-key': 'alert-replay-key',
    };

    const res1 = makeRes();
    await handler(makeReq({ headers, body }), res1);
    expect(res1.statusCode).toBe(201);
    expect(res1.headers['Idempotency-Replay']).toBeUndefined();
    const firstId = (res1.body as any).alert.id;

    const res2 = makeRes();
    await handler(makeReq({ headers, body }), res2);
    expect(res2.statusCode).toBe(201);
    expect(res2.headers['Idempotency-Replay']).toBe('true');
    // Réponse identique rejouée.
    expect((res2.body as any).alert.id).toBe(firstId);

    // Pas de double row : une seule alerte persistée.
    expect(store.blacklist_alerts as any[]).toHaveLength(1);
  });
});
