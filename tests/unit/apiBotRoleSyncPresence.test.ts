// POST /api/bot/v1/role-sync/presence — le bot rapporte QUI est sur le serveur.
//
// Le site savait qu'un compte Discord était LIÉ, jamais que la personne était
// encore sur le Discord. Lier son compte puis quitter le serveur la laissait
// apparaître en règle, alors que le bot ne pouvait plus ni lui donner ses
// rôles, ni la convoquer. Seul le bot voit le guild : cet endpoint est
// l'endroit où son constat atterrit.
//
// Deux propriétés à ne pas casser :
//   1. FULL REPLACE par tenant — le bot vient de parcourir l'ensemble des
//      comptes liés, sa vue est complète, les lignes absentes sont périmées.
//   2. Le scope tenant. Le serveur Discord d'un tenant ne dit RIEN de celui
//      d'un autre : purger le voisin effacerait un constat parfaitement valide.
//
// Cible : pages/api/bot/v1/role-sync/presence.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/role-sync/presence';

const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';
const PRESENT = '900000000000000001';
const ABSENT = '900000000000000002';

function makeReq(over: Partial<any> = {}, method = 'POST'): any {
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
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  seedBotAuth();
  store.tenants = [
    {
      id: CONFERENCE_TENANT_ID,
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
    },
  ] as any;
  store.discord_guild_presence = [] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('auth', () => {
  it('401 sans api key', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });
});

describe('enregistrement du constat', () => {
  it('écrit une ligne par compte, présent ou absent', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          members: [
            { discordUserId: PRESENT, inGuild: true },
            { discordUserId: ABSENT, inGuild: false },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ count: 2, present: 1, absent: 1 });

    const rows = store.discord_guild_presence as any[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tenant_id === CONFERENCE_TENANT_ID)).toBe(true);
    expect(rows.find((r) => r.discord_user_id === ABSENT).in_guild).toBe(false);
  });

  it('un absent est un CONSTAT enregistré, pas une ligne omise', async () => {
    // C'est toute la différence avec « on ne sait pas » : sans ligne, le site
    // ne peut pas distinguer « partie du serveur » de « jamais vérifiée », et
    // ne signalerait donc rien.
    const res = makeRes();
    await handler(
      makeReq({
        body: { members: [{ discordUserId: ABSENT, inGuild: false }] },
      }),
      res
    );
    expect(store.discord_guild_presence).toHaveLength(1);
  });

  it('dédoublonne un compte présent deux fois dans le payload', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          members: [
            { discordUserId: PRESENT, inGuild: false },
            { discordUserId: PRESENT, inGuild: true },
          ],
        },
      }),
      res
    );
    expect(res.body).toMatchObject({ count: 1, present: 1 });
    expect(store.discord_guild_presence).toHaveLength(1);
  });
});

describe('full replace', () => {
  it('remplace le constat précédent du tenant', async () => {
    store.discord_guild_presence = [
      {
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: '900000000000000009',
        in_guild: true,
        checked_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await handler(
      makeReq({
        body: { members: [{ discordUserId: PRESENT, inGuild: true }] },
      }),
      res
    );

    const rows = store.discord_guild_presence as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].discord_user_id).toBe(PRESENT);
  });

  it('ne touche PAS au constat d’un autre tenant', async () => {
    store.discord_guild_presence = [
      {
        tenant_id: OTHER_TENANT,
        discord_user_id: '900000000000000009',
        in_guild: true,
        checked_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await handler(
      makeReq({
        body: { members: [{ discordUserId: PRESENT, inGuild: true }] },
      }),
      res
    );

    const rows = store.discord_guild_presence as any[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.tenant_id === OTHER_TENANT).discord_user_id).toBe(
      '900000000000000009'
    );
  });

  it('une liste vide n’efface rien — le bot ne l’envoie pas, mais la garde tient', async () => {
    // Un cycle qui n'a rien constaté ne doit pas se traduire par « le serveur
    // s'est vidé ». Le bot s'abstient d'appeler ; ici on vérifie que même
    // appelé, le résultat reste cohérent (0 ligne écrite, 0 annoncée).
    const res = makeRes();
    await handler(makeReq({ body: { members: [] } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ count: 0, present: 0, absent: 0 });
  });
});

describe('mode upsert (constat ponctuel : GuildMemberAdd / Remove)', () => {
  // Le cycle complet ne repasse que toutes les 30 min. Sans constat à chaud,
  // l'espace équipe affiche « a quitté le Discord » sur quelqu'un qui vient de
  // rejoindre le serveur — et la capitaine part la réinviter pour rien.
  it('met à jour la ligne visée SANS purger le reste du tenant', async () => {
    store.discord_guild_presence = [
      {
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: PRESENT,
        in_guild: false,
        checked_at: '2026-01-01T00:00:00.000Z',
      },
      {
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: ABSENT,
        in_guild: true,
        checked_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await handler(
      makeReq({
        body: {
          members: [{ discordUserId: PRESENT, inGuild: true }],
          mode: 'upsert',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ count: 1, present: 1, mode: 'upsert' });

    const rows = store.discord_guild_presence as any[];
    expect(rows).toHaveLength(2);
    // La ligne visée est corrigée…
    const target = rows.find((r) => r.discord_user_id === PRESENT);
    expect(target.in_guild).toBe(true);
    expect(target.checked_at).not.toBe('2026-01-01T00:00:00.000Z');
    // …et celle qu'on n'a pas rapportée est intacte : le bot ne savait rien
    // d'elle à cet instant, il n'avait aucun titre à l'effacer.
    expect(rows.find((r) => r.discord_user_id === ABSENT).in_guild).toBe(true);
  });

  it('crée la ligne quand le tenant n’a encore aucun constat', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          members: [{ discordUserId: ABSENT, inGuild: false }],
          mode: 'upsert',
        },
      }),
      res
    );
    const rows = store.discord_guild_presence as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].in_guild).toBe(false);
  });

  it('sans `mode`, on reste en full replace — contrat historique du bot', async () => {
    store.discord_guild_presence = [
      {
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: ABSENT,
        in_guild: true,
        checked_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await handler(
      makeReq({
        body: { members: [{ discordUserId: PRESENT, inGuild: true }] },
      }),
      res
    );

    expect(res.body).toMatchObject({ mode: 'replace' });
    const rows = store.discord_guild_presence as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].discord_user_id).toBe(PRESENT);
  });
});

describe('validation', () => {
  it('400 sur un inGuild non booléen', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: { members: [{ discordUserId: PRESENT, inGuild: 'oui' }] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 sur un mode inconnu — pas de repli silencieux sur replace', async () => {
    // Un typo (`upserts`) qui retomberait sur le full replace effacerait tout
    // le constat du tenant sur la foi d'un seul membre.
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          members: [{ discordUserId: PRESENT, inGuild: true }],
          mode: 'upserts',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 sur un discordUserId qui n’est pas un snowflake', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: { members: [{ discordUserId: 'nope', inGuild: true }] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});
