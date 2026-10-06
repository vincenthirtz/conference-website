// Fin de vie d'une fiche « joueuse libre » web : relance avant péremption,
// prolongation, renvoi des liens, et retrait de l'annonce Discord.
//
// Ce que ces tests protègent, par ordre d'importance :
//   1. Une annonce Discord ne survit plus à sa fiche — retrait, péremption ou
//      ancrage remplacé : chaque chemin émet `free_player.withdrawn`.
//   2. La relance part UNE fois par cycle : un cron rejoué ne harcèle pas.
//   3. Le renvoi de lien n'est pas un oracle : même réponse, fiche ou non, et
//      l'email ne part qu'à l'adresse de la fiche.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/captcha', () => ({
  verifyCaptcha: vi.fn(() => ({ valid: true })),
}));

const { emitBotEvent, sendExpiry, sendLinks } = vi.hoisted(() => ({
  emitBotEvent: vi.fn(
    async (
      _event: string,
      _data: unknown,
      _tenantId: string,
      _opts?: unknown
    ) => ({
      delivered: true,
      attempts: 1,
    })
  ),
  sendExpiry: vi.fn(async (_opts: unknown) => ({ success: true })),
  sendLinks: vi.fn(async (_opts: unknown) => ({ success: true })),
}));
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent,
  BOT_EVENT_NAMES: [],
}));
vi.mock('@/utils/email', () => ({
  sendFreePlayerPublishedEmail: vi.fn(async () => ({ success: true })),
  sendFreePlayerExpiryReminderEmail: sendExpiry,
  sendFreePlayerLinksEmail: sendLinks,
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
import removeHandler from '../../pages/api/public/free-players/remove';
import renewHandler from '../../pages/api/public/free-players/renew';
import resendHandler from '../../pages/api/public/free-players/resend-link';
import announcementHandler from '../../pages/api/bot/v1/free-players/announcement';
import cronHandler from '../../pages/api/cron/free-players-expiry';
import { generateFreePlayerRemovalToken } from '../../utils/freePlayerRemoval';

const CHANNEL = '111111111111111111';
const MESSAGE = '222222222222222222';
const FICHE = '3f0c2a4e-8d1b-4c6f-9a2e-1b7d5e9c0a11';
const DAY = 86_400_000;

let ipCounter = 0;
function randomIp() {
  ipCounter += 1;
  return `10.8.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
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

function fiche(over: Record<string, unknown> = {}) {
  return {
    id: FICHE,
    tenant_id: CONFERENCE_TENANT_ID,
    source: 'web',
    display_name: 'Nova',
    contact_email: 'nova@gmail.com',
    roles: ['support'],
    level: 'gold',
    availability: 'le soir',
    marked_at: '2026-08-01T10:00:00.000Z',
    expires_at: new Date(Date.now() + 30 * DAY).toISOString(),
    expiry_reminder_sent_at: null,
    discord_announce_channel_id: null,
    discord_announce_message_id: null,
    ...over,
  };
}

function withdrawnCalls() {
  return emitBotEvent.mock.calls.filter(
    (c: unknown[]) => c[0] === 'free_player.withdrawn'
  );
}

beforeEach(() => {
  resetSupabaseMock();
  emitBotEvent.mockClear();
  sendExpiry.mockClear();
  sendLinks.mockClear();
  process.env.CRON_SECRET = 'cron-test-secret';
});

// ---------------------------------------------------------------------------
// Retrait → l'annonce Discord part avec la fiche
// ---------------------------------------------------------------------------

describe('retrait et annonce Discord', () => {
  it('demande la suppression de l’annonce ancrée', async () => {
    store.free_players = [
      fiche({
        discord_announce_channel_id: CHANNEL,
        discord_announce_message_id: MESSAGE,
      }),
    ] as any[];

    const res = makeRes();
    await removeHandler(
      makeReq({ body: { token: generateFreePlayerRemovalToken(FICHE) } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(store.free_players).toHaveLength(0);
    const calls = withdrawnCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({
      freePlayerId: FICHE,
      channelId: CHANNEL,
      messageId: MESSAGE,
      reason: 'removed',
    });
    expect(calls[0][2]).toBe(CONFERENCE_TENANT_ID);
  });

  it('n’émet rien pour une fiche jamais annoncée', async () => {
    store.free_players = [fiche()] as any[];
    await removeHandler(
      makeReq({ body: { token: generateFreePlayerRemovalToken(FICHE) } }),
      makeRes()
    );
    expect(withdrawnCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Route bot : ancrage de l'annonce
// ---------------------------------------------------------------------------

describe('POST /api/bot/v1/free-players/announcement', () => {
  function botReq(body: Record<string, unknown>) {
    return makeReq({
      headers: {
        host: 'owwomenscup.fr',
        'x-api-key': BOT_TEST_API_KEY,
        'x-real-ip': randomIp(),
      },
      body,
    });
  }

  it('enregistre où le bot a posté', async () => {
    seedBotAuth();
    store.free_players = [fiche()] as any[];

    const res = makeRes();
    await announcementHandler(
      botReq({ freePlayerId: FICHE, channelId: CHANNEL, messageId: MESSAGE }),
      res
    );

    expect(res.statusCode).toBe(200);
    const row = (store.free_players as any[])[0];
    expect(row.discord_announce_channel_id).toBe(CHANNEL);
    expect(row.discord_announce_message_id).toBe(MESSAGE);
    expect(withdrawnCalls()).toHaveLength(0);
  });

  it('404 quand la fiche a disparu entre-temps (le bot supprimera son message)', async () => {
    seedBotAuth();
    store.free_players = [] as any[];

    const res = makeRes();
    await announcementHandler(
      botReq({ freePlayerId: FICHE, channelId: CHANNEL, messageId: MESSAGE }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('FREE_PLAYER_NOT_FOUND');
  });

  it('retire l’ancienne annonce quand une nouvelle la remplace', async () => {
    seedBotAuth();
    const OLD = '333333333333333333';
    store.free_players = [
      fiche({
        discord_announce_channel_id: CHANNEL,
        discord_announce_message_id: OLD,
      }),
    ] as any[];

    await announcementHandler(
      botReq({ freePlayerId: FICHE, channelId: CHANNEL, messageId: MESSAGE }),
      makeRes()
    );

    const calls = withdrawnCalls();
    expect(calls).toHaveLength(1);
    expect((calls[0][1] as any).messageId).toBe(OLD);
    expect((store.free_players as any[])[0].discord_announce_message_id).toBe(
      MESSAGE
    );
  });

  it('refuse un id Discord malformé', async () => {
    seedBotAuth();
    store.free_players = [fiche()] as any[];
    const res = makeRes();
    await announcementHandler(
      botReq({ freePlayerId: FICHE, channelId: 'abc', messageId: MESSAGE }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Prolongation « je cherche toujours »
// ---------------------------------------------------------------------------

describe('prolongation', () => {
  it('GET décrit la fiche sans rien changer', async () => {
    const before = fiche();
    store.free_players = [before] as any[];

    const res = makeRes();
    await renewHandler(
      makeReq({
        method: 'GET',
        query: { token: generateFreePlayerRemovalToken(FICHE) },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      name: 'Nova',
      expiresAt: before.expires_at,
      expired: false,
    });
    expect((store.free_players as any[])[0].expires_at).toBe(before.expires_at);
  });

  it('POST repousse l’échéance de 60 jours et réarme la relance', async () => {
    store.free_players = [
      fiche({
        expires_at: new Date(Date.now() + 3 * DAY).toISOString(),
        expiry_reminder_sent_at: new Date().toISOString(),
      }),
    ] as any[];

    const res = makeRes();
    await renewHandler(
      makeReq({ body: { token: generateFreePlayerRemovalToken(FICHE) } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const row = (store.free_players as any[])[0];
    const remaining = new Date(row.expires_at).getTime() - Date.now();
    expect(remaining).toBeGreaterThan(59 * DAY);
    expect(row.expiry_reminder_sent_at).toBeNull();
    // Fiche encore vivante : son annonce est intacte, pas de réannonce.
    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('une fiche expirée revient en ligne ET est réannoncée', async () => {
    store.free_players = [
      fiche({ expires_at: new Date(Date.now() - DAY).toISOString() }),
    ] as any[];

    await renewHandler(
      makeReq({ body: { token: generateFreePlayerRemovalToken(FICHE) } }),
      makeRes()
    );

    const registered = emitBotEvent.mock.calls.filter(
      (c: unknown[]) => c[0] === 'free_player.registered'
    );
    expect(registered).toHaveLength(1);
    expect((registered[0][1] as any).freePlayerId).toBe(FICHE);
    // Aucun moyen de contact dans l'event.
    expect(registered[0][1]).not.toHaveProperty('contactEmail');
  });

  it('refuse un token altéré', async () => {
    store.free_players = [fiche()] as any[];
    const res = makeRes();
    await renewHandler(makeReq({ body: { token: 'abc.def' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Lien perdu
// ---------------------------------------------------------------------------

describe('renvoi des liens', () => {
  const body = {
    email: 'Nova@Gmail.com',
    captchaToken: 't',
    captchaAnswer: '4',
  };

  it('envoie les liens à l’adresse de la fiche', async () => {
    store.free_players = [fiche()] as any[];
    const res = makeRes();
    await resendHandler(makeReq({ body }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(sendLinks).toHaveBeenCalledTimes(1);
    const arg = (sendLinks.mock.calls[0] as any[])[0];
    expect(arg.to).toBe('nova@gmail.com');
    expect(arg.removeUrl).toContain('/rejoindre/retrait?token=');
    expect(arg.renewUrl).toContain('/rejoindre/prolonger?token=');
  });

  it('même réponse quand aucune fiche n’existe — et aucun email', async () => {
    store.free_players = [] as any[];
    const res = makeRes();
    await resendHandler(makeReq({ body }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(sendLinks).not.toHaveBeenCalled();
  });

  it('avale un honeypot rempli sans rien envoyer', async () => {
    store.free_players = [fiche()] as any[];
    const res = makeRes();
    await resendHandler(makeReq({ body: { ...body, honeypot: 'x' } }), res);
    expect(res.body).toEqual({ success: true });
    expect(sendLinks).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cron de fin de vie
// ---------------------------------------------------------------------------

describe('cron free-players-expiry', () => {
  function cronReq(query: Record<string, string> = {}) {
    return makeReq({
      headers: {
        host: 'owwomenscup.fr',
        authorization: 'Bearer cron-test-secret',
      },
      query,
    });
  }

  it('401 sans le secret', async () => {
    const res = makeRes();
    await cronHandler(makeReq(), res);
    expect(res.statusCode).toBe(401);
  });

  it('relance UNE fois une fiche qui expire bientôt', async () => {
    store.free_players = [
      fiche({ expires_at: new Date(Date.now() + 5 * DAY).toISOString() }),
    ] as any[];

    await cronHandler(cronReq(), makeRes());
    await cronHandler(cronReq(), makeRes());

    expect(sendExpiry).toHaveBeenCalledTimes(1);
    expect((store.free_players as any[])[0].expiry_reminder_sent_at).not.toBe(
      null
    );
  });

  it('laisse tranquille une fiche loin de son échéance, et les fiches Discord', async () => {
    store.free_players = [
      fiche(),
      fiche({
        id: 'discord-1',
        source: 'discord',
        contact_email: null,
        expires_at: null,
      }),
    ] as any[];

    await cronHandler(cronReq(), makeRes());
    expect(sendExpiry).not.toHaveBeenCalled();
  });

  it('retire l’annonce d’une fiche expirée puis efface l’ancrage', async () => {
    store.free_players = [
      fiche({
        expires_at: new Date(Date.now() - DAY).toISOString(),
        discord_announce_channel_id: CHANNEL,
        discord_announce_message_id: MESSAGE,
      }),
    ] as any[];

    const res = makeRes();
    await cronHandler(cronReq(), res);

    expect(res.body.announcements.withdrawn).toBe(1);
    const calls = withdrawnCalls();
    expect(calls).toHaveLength(1);
    expect((calls[0][1] as any).reason).toBe('expired');
    const row = (store.free_players as any[])[0];
    expect(row.discord_announce_message_id).toBeNull();
    // La fiche n'est pas purgée : elle reste prolongeable.
    expect(store.free_players).toHaveLength(1);
  });

  it('dry_run ne touche à rien', async () => {
    store.free_players = [
      fiche({ expires_at: new Date(Date.now() + 2 * DAY).toISOString() }),
    ] as any[];

    const res = makeRes();
    await cronHandler(cronReq({ dry_run: '1' }), res);

    expect(res.body.reminders.candidates).toBe(1);
    expect(sendExpiry).not.toHaveBeenCalled();
    expect((store.free_players as any[])[0].expiry_reminder_sent_at).toBeNull();
  });
});
