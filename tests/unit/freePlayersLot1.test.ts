// Lot 1 — le parcours « je joue seule » (docs/BACKLOG-acquisition-joueuses.md).
//
// Ce que ces tests protègent, par ordre d'importance :
//   1. AUCUNE fuite de contact par la route publique. L'email est la
//      contrepartie du « sans compte » : le jour où un `select('*')` distrait
//      le fait sortir, rien ne casse à l'écran — d'où un test explicite.
//   2. La synchro Discord (FULL REPLACE) ne doit PLUS effacer les inscriptions
//      web. C'est la régression la plus coûteuse du lot : silencieuse, et elle
//      viderait le marché qu'on vient d'ouvrir.
//   3. Le formulaire public reste sans compte, mais pas sans garde-fou
//      (honeypot, captcha, validation).

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Captcha toujours valide : ce qu'on teste ici c'est le comportement métier,
// pas la crypto du challenge (couverte par ses propres tests).
vi.mock('@/utils/captcha', () => ({
  verifyCaptcha: vi.fn(() => ({ valid: true })),
}));

// Le push sortant vers le bot ne doit jamais partir en test. `vi.hoisted` est
// obligatoire ici : les factories de `vi.mock` sont remontées en tête de
// fichier et ne peuvent pas capturer une variable déclarée plus bas.
const { emitBotEvent } = vi.hoisted(() => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent,
  BOT_EVENT_NAMES: [],
}));

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  BOT_TEST_API_KEY,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import {
  computeExpiresAt,
  isActive,
  normalizeRoles,
  toPublicFreePlayer,
  FREE_PLAYER_TTL_DAYS,
  type FreePlayerRow,
} from '../../utils/freePlayers';
import publicHandler from '../../pages/api/public/free-players';
import botSyncHandler from '../../pages/api/bot/v1/free-players/sync';

let ipCounter = 0;
/** IP fraîche par requête : le bucket de rate-limit est partagé au process. */
function randomIp() {
  ipCounter += 1;
  return `10.9.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'owwomenscup.fr', 'x-real-ip': randomIp() },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const VALID_BODY = {
  displayName: 'Nova',
  email: 'Nova@Gmail.com',
  roles: ['support', 'tank'],
  level: 'gold',
  availability: 'en semaine après 20h',
  note: 'je débute en compétition',
  contactDiscord: 'nova#1234',
  captchaToken: 'tok',
  captchaAnswer: '4',
};

function row(over: Partial<FreePlayerRow> = {}): FreePlayerRow {
  return {
    id: 'row-1',
    source: 'web',
    discord_user_id: null,
    discord_username: null,
    auth_user_id: null,
    display_name: 'Nova',
    roles: ['support'],
    availability: 'le soir',
    level: 'gold',
    note: null,
    contact_email: 'nova@gmail.com',
    contact_discord: 'nova#1234',
    marked_at: '2026-08-01T10:00:00.000Z',
    expires_at: null,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  emitBotEvent.mockClear();
});

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

describe('toPublicFreePlayer', () => {
  it('ne laisse sortir AUCUN moyen de contact', () => {
    const projected = toPublicFreePlayer(row());
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('nova@gmail.com');
    expect(serialized).not.toContain('nova#1234');
    // Et rien qui ressemble à un identifiant Discord non plus.
    expect(projected).not.toHaveProperty('contact_email');
    expect(projected).not.toHaveProperty('discord_user_id');
  });

  it('projette ce qui aide une capitaine à décider', () => {
    expect(toPublicFreePlayer(row())).toEqual({
      id: 'row-1',
      name: 'Nova',
      roles: ['support'],
      level: 'gold',
      availability: 'le soir',
      note: null,
      since: '2026-08-01T10:00:00.000Z',
    });
  });

  it('retombe sur le pseudo Discord quand il n’y a pas de nom saisi', () => {
    const projected = toPublicFreePlayer(
      row({ source: 'discord', display_name: null, discord_username: 'nova_ow' })
    );
    expect(projected?.name).toBe('nova_ow');
  });

  it('écarte une row sans aucun nom affichable', () => {
    expect(
      toPublicFreePlayer(row({ display_name: null, discord_username: null }))
    ).toBeNull();
  });

  it('ignore un niveau inconnu plutôt que de le propager', () => {
    expect(toPublicFreePlayer(row({ level: 'radiant' }))?.level).toBeNull();
  });
});

describe('normalizeRoles', () => {
  it('filtre l’inconnu, déduplique et impose l’ordre canonique', () => {
    expect(normalizeRoles(['support', 'jungle', 'tank', 'support'])).toEqual([
      'tank',
      'support',
    ]);
  });

  it('tolère toute entrée non-tableau', () => {
    expect(normalizeRoles(null)).toEqual([]);
    expect(normalizeRoles('tank')).toEqual([]);
  });
});

describe('péremption', () => {
  it('computeExpiresAt place la limite à 60 jours', () => {
    const from = new Date('2026-08-23T12:00:00.000Z');
    const diffDays =
      (new Date(computeExpiresAt(from)).getTime() - from.getTime()) / 86_400_000;
    expect(Math.round(diffDays)).toBe(FREE_PLAYER_TTL_DAYS);
  });

  it('une row sans expires_at reste active (provenance Discord)', () => {
    expect(isActive(row({ expires_at: null }))).toBe(true);
  });

  it('une annonce dépassée est inactive', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    expect(isActive(row({ expires_at: '2026-08-22T12:00:00.000Z' }), now)).toBe(
      false
    );
    expect(isActive(row({ expires_at: '2026-08-24T12:00:00.000Z' }), now)).toBe(
      true
    );
  });
});

// ---------------------------------------------------------------------------
// Route publique
// ---------------------------------------------------------------------------

describe('GET /api/public/free-players', () => {
  it('anonymise : ni email ni pseudo Discord dans la réponse', async () => {
    store.free_players = [
      { ...row(), tenant_id: CONFERENCE_TENANT_ID },
    ] as any[];

    const res = makeRes();
    await publicHandler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('nova@gmail.com');
    expect(serialized).not.toContain('nova#1234');
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].name).toBe('Nova');
  });

  it('exclut les annonces périmées', async () => {
    store.free_players = [
      {
        ...row({ id: 'old', expires_at: '2020-01-01T00:00:00.000Z' }),
        tenant_id: CONFERENCE_TENANT_ID,
      },
      { ...row({ id: 'fresh' }), tenant_id: CONFERENCE_TENANT_ID },
    ] as any[];

    const res = makeRes();
    await publicHandler(makeReq({ method: 'GET' }), res);
    expect(res.body.players.map((p: any) => p.id)).toEqual(['fresh']);
  });

  it('405 sur une méthode non supportée', async () => {
    const res = makeRes();
    await publicHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
  });
});

describe('POST /api/public/free-players', () => {
  it('publie une fiche SANS compte et normalise l’email', async () => {
    store.free_players = [];
    const res = makeRes();
    await publicHandler(makeReq({ body: { ...VALID_BODY } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });

    const rows = store.free_players as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('web');
    expect(rows[0].contact_email).toBe('nova@gmail.com');
    // Ordre canonique appliqué, pas l'ordre de saisie.
    expect(rows[0].roles).toEqual(['tank', 'support']);
    expect(rows[0].expires_at).toBeTruthy();
    // Aucun compte créé : c'est tout l'objet du lot.
    expect(rows[0].auth_user_id ?? null).toBeNull();
  });

  it('prévient les capitaines via un event bot', async () => {
    store.free_players = [];
    await publicHandler(makeReq({ body: { ...VALID_BODY } }), makeRes());

    expect(emitBotEvent).toHaveBeenCalledTimes(1);
    const [event, payload] = emitBotEvent.mock.calls[0] as any[];
    expect(event).toBe('free_player.registered');
    // L'event annonce, il ne distribue pas de contact.
    expect(JSON.stringify(payload)).not.toContain('nova@gmail.com');
  });

  it('rejette une fiche sans poste', async () => {
    const res = makeRes();
    await publicHandler(
      makeReq({ body: { ...VALID_BODY, roles: [] } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('rejette un email jetable sans dire pourquoi', async () => {
    const res = makeRes();
    await publicHandler(
      makeReq({ body: { ...VALID_BODY, email: 'x@yopmail.com' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    // Le message ne nomme pas la raison : l'indiquer n'aide que celui qui
    // cherche à passer au travers.
    expect(res.body.error).not.toMatch(/jetable|disposable/i);
  });

  it('avale silencieusement un honeypot rempli', async () => {
    store.free_players = [];
    const res = makeRes();
    await publicHandler(
      makeReq({ body: { ...VALID_BODY, honeypot: 'bot' } }),
      res
    );
    // Succès générique : ne pas apprendre au bot qu'il est détecté.
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(store.free_players as any[]).toHaveLength(0);
    expect(emitBotEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Synchro Discord : le garde-fou du lot
// ---------------------------------------------------------------------------

describe('POST /api/bot/v1/free-players/sync', () => {
  function botReq(players: Array<{ discordUserId: string; discordUsername?: string }>) {
    return {
      method: 'POST',
      headers: {
        host: 'owwomenscup.fr',
        'x-api-key': BOT_TEST_API_KEY,
        'x-real-ip': randomIp(),
      },
      query: {},
      body: { players },
    } as any;
  }

  it('n’efface PAS les inscriptions web (régression la plus coûteuse du lot)', async () => {
    seedBotAuth();
    store.free_players = [
      // Inscription web : n'appartient pas au bot.
      {
        ...row({ id: 'web-1' }),
        tenant_id: CONFERENCE_TENANT_ID,
      },
      // Row Discord périmée : elle, doit disparaître (le membre a perdu le rôle).
      {
        ...row({
          id: 'discord-stale',
          source: 'discord',
          discord_user_id: '100000000000000111',
          discord_username: 'ancienne',
          display_name: null,
          contact_email: null,
        }),
        tenant_id: CONFERENCE_TENANT_ID,
      },
    ] as any[];

    const res = makeRes();
    await botSyncHandler(botReq([{ discordUserId: '100000000000000222', discordUsername: 'nouvelle' }]), res);

    expect(res.statusCode).toBe(200);
    const rows = store.free_players as any[];
    const bySource = {
      web: rows.filter((r) => r.source === 'web'),
      discord: rows.filter((r) => r.source === 'discord'),
    };
    // L'inscription web a survécu…
    expect(bySource.web).toHaveLength(1);
    expect(bySource.web[0].id).toBe('web-1');
    // …et le set Discord a bien été remplacé.
    expect(bySource.discord.map((r) => r.discord_user_id)).toEqual(['100000000000000222']);
  });

  it('marque explicitement la provenance des rows qu’il insère', async () => {
    seedBotAuth();
    store.free_players = [];

    const res = makeRes();
    await botSyncHandler(botReq([{ discordUserId: '100000000000000333' }]), res);

    expect(res.statusCode).toBe(200);
    expect((store.free_players as any[])[0].source).toBe('discord');
  });
});
