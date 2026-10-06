// tests/unit/captainMessageNotify.test.ts
//
// Messages entre capitaines (lot P6 joueuse) — `captain.message`.
//
// Ce que ce fichier verrouille :
//   1. un envoi émet UN event vers les détentrices de send_captain_messages
//      côté équipe DESTINATAIRE (capitaine, rôle qui l'accorde, délégation
//      active) — pas un coach sans la permission, pas une délégation révoquée,
//      pas l'expéditrice ;
//   2. une destinataire qui a coupé `captain.message` n'est pas annoncée ;
//      plus personne → aucun event ;
//   3. le contenu du message ne sort jamais (payload, push, email) ;
//   4. une annonce ratée ne casse pas l'envoi ;
//   5. catalogues : bot, push, préférences joueuse, email, URL, rendu.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { emitBotEvent } = vi.hoisted(() => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));
vi.mock('@/utils/botEvents', () => ({ emitBotEvent }));

const { getDiscordLinksForUsers } = vi.hoisted(() => ({
  getDiscordLinksForUsers: vi.fn(async (userIds: string[]) => {
    const map = new Map<
      string,
      { discordUserId: string; discordUsername: string }
    >();
    for (const id of userIds) {
      if (id === 'cap-b') {
        map.set(id, { discordUserId: '99', discordUsername: 'cap_b' });
      }
    }
    return map;
  }),
}));
vi.mock('@/utils/discordLinks', () => ({ getDiscordLinksForUsers }));

import {
  store,
  resetSupabaseMock,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { sendMessage } from '../../features/player/messages/service/inbox';
import { loadCaptainMessageRecipients } from '../../utils/teams/captainMessageNotify';
import { BOT_EVENT_NAMES } from '../../utils/botEventNames';
import {
  EMAIL_EVENT_TYPES,
  PLAYER_PUSH_EVENT_TYPES,
  WEB_PUSH_EVENT_TYPES,
  playerUrlForEvent,
  renderEmailPayload,
  renderWebPushPayload,
} from '../../utils/webPushEvents';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const SECRET = 'Rendez-vous secret jeudi 21h';

const logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as any;

function ctx(userId = 'cap-a') {
  return { db: supabaseAdmin as any, tenantId: TENANT, logger, userId };
}

const sender = { email: 'a@example.com', user_metadata: {} } as any;

function seed() {
  resetSupabaseMock();
  emitBotEvent.mockClear();
  store.teams = [
    {
      id: 'team-a',
      tenant_id: TENANT,
      captain_id: 'cap-a',
      is_active: true,
      name: 'Alpha',
    },
    {
      id: 'team-b',
      tenant_id: TENANT,
      captain_id: 'cap-b',
      is_active: true,
      name: 'Bravo',
    },
  ] as any;
  store.team_members = [
    // manager : toutes les permissions par défaut.
    { team_id: 'team-b', tenant_id: TENANT, user_id: 'mgr-b', role: 'manager' },
    // coach : manage_scrims + validate_lineup, PAS send_captain_messages.
    { team_id: 'team-b', tenant_id: TENANT, user_id: 'coach-b', role: 'Coach' },
    {
      team_id: 'team-b',
      tenant_id: TENANT,
      user_id: 'player-b',
      role: 'player',
    },
    {
      team_id: 'team-b',
      tenant_id: TENANT,
      user_id: 'deleg-b',
      role: 'player',
    },
    {
      team_id: 'team-b',
      tenant_id: TENANT,
      user_id: 'revoked-b',
      role: 'player',
    },
  ] as any;
  store.team_member_permissions = [
    {
      team_id: 'team-b',
      tenant_id: TENANT,
      user_id: 'deleg-b',
      permission: 'send_captain_messages',
      revoked_at: null,
    },
    {
      team_id: 'team-b',
      tenant_id: TENANT,
      user_id: 'revoked-b',
      permission: 'send_captain_messages',
      revoked_at: '2026-10-01T00:00:00Z',
    },
  ] as any;
  store.notification_prefs = [];
  store.demandes = [];
}

function messageEvents() {
  return emitBotEvent.mock.calls.filter(
    (c: unknown[]) => c[0] === 'captain.message'
  ) as unknown as Array<[string, Record<string, unknown>, string]>;
}

describe('loadCaptainMessageRecipients', () => {
  beforeEach(seed);

  it('capitaine + rôle qui accorde la permission + délégation active', async () => {
    const ids = await loadCaptainMessageRecipients('team-b', TENANT);
    expect(ids.sort()).toEqual(['cap-b', 'deleg-b', 'mgr-b']);
  });

  it('équipe inconnue / autre tenant → personne', async () => {
    expect(await loadCaptainMessageRecipients('team-x', TENANT)).toEqual([]);
    expect(await loadCaptainMessageRecipients('team-b', 'other')).toEqual([]);
  });
});

describe('sendMessage → captain.message', () => {
  beforeEach(seed);

  it('émet un event vers les destinataires, sans le contenu', async () => {
    const out = await sendMessage(ctx(), sender, null, {
      content: SECRET,
      targetTeamId: 'team-b',
    });
    expect(out.success).toBe(true);

    const events = messageEvents();
    expect(events).toHaveLength(1);
    const [, payload, tenant] = events[0];
    expect(tenant).toBe(TENANT);
    expect((payload.recipientUserIds as string[]).sort()).toEqual([
      'cap-b',
      'deleg-b',
      'mgr-b',
    ]);
    expect(payload).toMatchObject({
      fromTeamId: 'team-a',
      fromTeamName: 'Alpha',
      toTeamId: 'team-b',
      toTeamName: 'Bravo',
      conversationId: out.conversationId,
    });
    expect(String(payload.ctaUrl)).toMatch(/\/player\/messages$/);
    const capB = (payload.recipients as any[]).find(
      (r) => r.userId === 'cap-b'
    );
    expect(capB).toMatchObject({
      discordUserId: '99',
      discordUsername: 'cap_b',
    });
    const mgrB = (payload.recipients as any[]).find(
      (r) => r.userId === 'mgr-b'
    );
    expect(mgrB.discordUserId).toBeNull();
    // Le contenu ne sort JAMAIS.
    expect(JSON.stringify(payload)).not.toContain('secret');
  });

  it("n'annonce pas l'expéditrice si elle gère aussi l'équipe cible", async () => {
    (store.team_members as any[]).push({
      team_id: 'team-b',
      tenant_id: TENANT,
      user_id: 'cap-a',
      role: 'manager',
    });
    await sendMessage(ctx(), sender, 'team-a', {
      content: 'hello',
      targetTeamId: 'team-b',
    });
    const ids = messageEvents()[0][1].recipientUserIds as string[];
    expect(ids).not.toContain('cap-a');
  });

  it('retire une destinataire qui a coupé captain.message', async () => {
    store.notification_prefs = [
      {
        user_id: 'mgr-b',
        event_type: 'captain.message',
        channel: 'push',
        enabled: false,
      },
    ] as any;
    await sendMessage(ctx(), sender, null, {
      content: 'hello',
      targetTeamId: 'team-b',
    });
    const ids = messageEvents()[0][1].recipientUserIds as string[];
    expect(ids.sort()).toEqual(['cap-b', 'deleg-b']);
  });

  it('plus personne à prévenir → aucun event', async () => {
    store.notification_prefs = ['cap-b', 'mgr-b', 'deleg-b'].map((u) => ({
      user_id: u,
      event_type: 'captain.message',
      channel: 'push',
      enabled: false,
    })) as any;
    const out = await sendMessage(ctx(), sender, null, {
      content: 'hello',
      targetTeamId: 'team-b',
    });
    expect(out.success).toBe(true);
    expect(messageEvents()).toHaveLength(0);
  });

  it("une annonce en échec ne casse pas l'envoi", async () => {
    emitBotEvent.mockRejectedValueOnce(new Error('outbox down'));
    const out = await sendMessage(ctx(), sender, null, {
      content: 'hello',
      targetTeamId: 'team-b',
    });
    expect(out.success).toBe(true);
    expect(store.demandes).toHaveLength(1);
  });

  it("un envoi refusé (équipe cible inconnue) n'annonce rien", async () => {
    await expect(
      sendMessage(ctx(), sender, null, {
        content: 'hello',
        targetTeamId: 'team-x',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(messageEvents()).toHaveLength(0);
  });
});

describe('captain.message — catalogues et rendu', () => {
  it('event bot, push, préférence joueuse et e-mail', () => {
    expect(BOT_EVENT_NAMES).toContain('captain.message');
    expect(WEB_PUSH_EVENT_TYPES).toContain('captain.message');
    expect(PLAYER_PUSH_EVENT_TYPES).toContain('captain.message');
    expect(EMAIL_EVENT_TYPES).toContain('captain.message');
  });

  it('lien joueuse = la messagerie', () => {
    expect(playerUrlForEvent('captain.message', {})).toBe('/player/messages');
  });

  it("push : l'équipe émettrice, jamais le contenu", () => {
    const r = renderWebPushPayload('captain.message', {
      data: { fromTeamName: 'Alpha', content: SECRET },
    });
    expect(r.url).toBe('/player/messages');
    expect(r.body).toContain('Alpha');
    expect(`${r.title} ${r.body}`).not.toContain('secret');
  });

  it('push : repli neutre sans nom d’équipe', () => {
    const r = renderWebPushPayload('captain.message', {});
    expect(r.body).toMatch(/Une équipe/);
  });

  it('email : rendu sans contenu', () => {
    const r = renderEmailPayload('captain.message', {
      data: { fromTeamName: 'Alpha' },
    });
    expect(r.url).toBe('/player/messages');
    expect(r.body).toContain('Alpha');
  });
});
