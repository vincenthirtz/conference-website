import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* -----------------------------------------------------------
 * Mock supabase so resolveWebhook can return the URL we want
 * per test. The mock exposes a global setter we can call from
 * within tests to control the next maybeSingle() result.
 * ---------------------------------------------------------*/
let nextWebhookResult: { data: any } = { data: null };

function setNextWebhook(data: any) {
  nextWebhookResult = { data };
}

function makeChain() {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: () => Promise.resolve(nextWebhookResult),
  };
  return chain;
}

vi.mock('../../utils/supabase', () => ({
  supabaseAdmin: {
    from: () => makeChain(),
  },
}));

import {
  postToDiscordWebhook,
  notifyScrimRequest,
  notifyMatchStarting,
  notifyMatchResult,
  notifyBracketUpdate,
  notifyAnnouncement,
  notifyVetoStep,
  notifyCheckinReminder,
  notifyCheckinForfeit,
  notifySupportTicket,
  postMvpPoll,
} from '../../utils/discord';

const origEnv = { ...process.env };

beforeEach(() => {
  nextWebhookResult = { data: null };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...origEnv };
  vi.restoreAllMocks();
});

function jsonOk(body: any = { id: 'msg-123' }) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function nonOk(status: number, body = 'oops') {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
  };
}

/* -----------------------------------------------------------
 * postToDiscordWebhook
 * ---------------------------------------------------------*/

describe('postToDiscordWebhook', () => {
  it('does nothing when webhookUrl is empty', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await postToDiscordWebhook('', { content: 'x' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('POSTs the payload as JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await postToDiscordWebhook('https://discord.example/hook', {
      content: 'hi',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://discord.example/hook');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual({ content: 'hi' });
  });

  it('does not throw on non-2xx responses (fire-and-forget)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nonOk(403)));
    await expect(
      postToDiscordWebhook('https://x', { content: 'y' })
    ).resolves.toBeUndefined();
  });

  it('does not throw on fetch rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network down'))
    );
    await expect(
      postToDiscordWebhook('https://x', { content: 'y' })
    ).resolves.toBeUndefined();
  });
});

/* -----------------------------------------------------------
 * notifyScrimRequest (env-based webhook, no DB lookup)
 * ---------------------------------------------------------*/

describe('notifyScrimRequest', () => {
  it('skips when DISCORD_SCRIM_WEBHOOK_URL is not set', async () => {
    delete process.env.DISCORD_SCRIM_WEBHOOK_URL;
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await notifyScrimRequest({ fromTeamName: 'A', targetTeamName: 'B' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('posts a scrim embed to the configured webhook', async () => {
    process.env.DISCORD_SCRIM_WEBHOOK_URL = 'https://discord.example/scrim';
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyScrimRequest({
      fromTeamName: 'Alpha',
      targetTeamName: 'Beta',
      preferredDate: '2026-04-15T18:00:00Z',
      message: 'Salut !',
      requesterDisplayName: 'Captain X',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toContain('scrim');
    const fieldNames = body.embeds[0].fields.map((f: any) => f.name);
    expect(fieldNames).toContain('Équipe demandeuse');
    expect(fieldNames).toContain('Équipe cible');
    expect(fieldNames).toContain('Date souhaitée');
    expect(fieldNames).toContain('Message');
    expect(fieldNames).toContain('Capitaine');
  });

  it('truncates very long messages to 1000 chars', async () => {
    process.env.DISCORD_SCRIM_WEBHOOK_URL = 'https://x';
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyScrimRequest({
      fromTeamName: 'A',
      targetTeamName: 'B',
      message: 'x'.repeat(2000),
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const messageField = body.embeds[0].fields.find(
      (f: any) => f.name === 'Message'
    );
    expect(messageField.value).toHaveLength(1000);
  });
});

/* -----------------------------------------------------------
 * Webhook-resolved notifiers
 * ---------------------------------------------------------*/

describe('webhook-resolved notifiers', () => {
  it('notifyMatchStarting skips silently when no webhook is configured', async () => {
    setNextWebhook(null);
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await notifyMatchStarting({
      tournamentId: 'tid',
      matchId: 'mid-12345678',
      team1: { name: 'A' },
      team2: { name: 'B' },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('notifyMatchStarting builds the right payload when a webhook resolves', async () => {
    setNextWebhook({
      webhook_url: 'https://discord.example/match',
      role_mention: '12345',
    });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyMatchStarting({
      tournamentId: 'tid',
      tournamentName: 'Coupe',
      matchId: 'abcdef1234567890',
      roundName: 'Quart',
      team1: { name: 'Alpha', discordRoleId: '1111' },
      team2: { name: 'Beta', discordRoleId: '2222' },
      lobbyCode: 'LOBBY42',
      streamUrl: 'https://twitch.tv/x',
      scheduledAt: '2026-04-15T18:00:00Z',
      matchFormat: 'bo3',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://discord.example/match');
    const body = JSON.parse(opts.body);

    // Channel ping + team pings appear in the content
    expect(body.content).toContain('<@&12345>');
    expect(body.content).toContain('<@&1111>');
    expect(body.content).toContain('<@&2222>');

    // Embed fields use the right values
    const fields = body.embeds[0].fields as { name: string; value: string }[];
    const get = (n: string) => fields.find((f) => f.name === n)?.value;
    expect(get('Format')).toBe('BO3');
    expect(get('Round')).toBe('Quart');
    expect(get('Code lobby')).toBe('`LOBBY42`');
    expect(get('Stream')).toBe('https://twitch.tv/x');

    // allowed_mentions whitelists exactly the role IDs we ping
    expect(body.allowed_mentions.roles).toEqual(
      expect.arrayContaining(['12345', '1111', '2222'])
    );
  });

  it('notifyMatchResult sets the winner from the team mapping', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyMatchResult({
      tournamentId: null,
      matchId: 'm-12345678',
      team1: { name: 'Alpha' },
      team2: { name: 'Beta' },
      team1Score: 2,
      team2Score: 1,
      winnerTeamId: 'tid-1',
      team1Id: 'tid-1',
      team2Id: 'tid-2',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toContain('Résultat');
    expect(body.embeds[0].description).toContain('Alpha');
    expect(body.embeds[0].description).toContain("l'emporte 2-1");
  });

  it('notifyMatchResult flags forfeit in title and description', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyMatchResult({
      tournamentId: null,
      matchId: 'm-12345678',
      team1: { name: 'Alpha' },
      team2: { name: 'Beta' },
      team1Score: 2,
      team2Score: 0,
      winnerTeamId: 'tid-1',
      team1Id: 'tid-1',
      team2Id: 'tid-2',
      isForfeit: true,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toContain('Forfait');
    expect(body.embeds[0].description).toContain('forfait');
  });

  it('notifyBracketUpdate sends winner + optional next opponent', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyBracketUpdate({
      tournamentId: 'tid',
      winnerName: 'Alpha',
      loserName: 'Beta',
      nextRoundName: 'Demi',
      nextOpponentName: 'Gamma',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const fields = body.embeds[0].fields as { name: string }[];
    expect(fields.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        'Éliminée / battue',
        'Prochain round',
        'Prochain adversaire',
      ])
    );
  });

  it('notifyAnnouncement adds CTA fields when both label and url are provided', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyAnnouncement({
      title: 'Salut',
      message: 'Hello world',
      ctaLabel: 'Voir',
      ctaUrl: 'https://example.com',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const fields = body.embeds[0].fields as { name: string; value: string }[];
    expect(fields[0]).toEqual({
      name: 'Voir',
      value: 'https://example.com',
      inline: false,
    });
  });

  it('notifyVetoStep marks decider as Système when no team is provided', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyVetoStep({
      tournamentId: null,
      matchId: 'm-12345678',
      team1Name: 'A',
      team2Name: 'B',
      stepNumber: 5,
      totalSteps: 5,
      action: 'decider',
      mapName: 'Hanamura',
      isComplete: true,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toMatch(/5\/5.*terminé/);
    expect(body.embeds[0].description).toContain('Système');
    expect(body.embeds[0].description).toContain('Decider');
    expect(body.embeds[0].description).toContain('Hanamura');
  });

  it('notifyCheckinReminder uses urgent title under 15 minutes', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyCheckinReminder({
      tournamentId: null,
      matchId: 'm-12345678',
      teamName: 'Alpha',
      teamRoleId: '999',
      opponentName: 'Beta',
      scheduledAt: '2026-04-15T18:00:00Z',
      minutesBeforeKickoff: 15,
      checkinUrl: 'https://example.com/checkin/abc',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toMatch(/15 minutes/);
    expect(body.embeds[0].title).toMatch(/⚠️/);
  });

  it('notifyCheckinReminder uses non-urgent title at 30 minutes', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyCheckinReminder({
      tournamentId: null,
      matchId: 'm-12345678',
      teamName: 'Alpha',
      teamRoleId: null,
      opponentName: 'Beta',
      scheduledAt: '2026-04-15T18:00:00Z',
      minutesBeforeKickoff: 30,
      checkinUrl: 'https://example.com/checkin/abc',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toMatch(/30 min/);
    expect(body.embeds[0].title).not.toMatch(/⚠️/);
  });

  it('notifyCheckinForfeit announces the forfeit with both team names', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifyCheckinForfeit({
      tournamentId: null,
      matchId: 'm-12345678',
      forfeitedTeamName: 'Alpha',
      forfeitedTeamRoleId: null,
      opponentName: 'Beta',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toContain('Forfait');
    expect(body.embeds[0].description).toContain('Alpha');
    expect(body.embeds[0].description).toContain('Beta');
  });
});

/* -----------------------------------------------------------
 * notifySupportTicket — severity-driven mention behavior
 * ---------------------------------------------------------*/

describe('notifySupportTicket', () => {
  it('returns null messageId when no webhook is configured', async () => {
    setNextWebhook(null);
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const out = await notifySupportTicket({
      ticketId: 't-12345678',
      tournamentId: null,
      category: 'other',
      severity: 'low',
      isAnonymous: true,
      reporterName: null,
      reporterEmail: null,
      subject: null,
      message: 'help',
    });

    expect(out.messageId).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('high severity pings the moderation role', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: '777' });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk({ id: 'msg-9' }));
    vi.stubGlobal('fetch', mockFetch);

    const out = await notifySupportTicket({
      ticketId: 't-12345678',
      tournamentId: null,
      category: 'dispute',
      severity: 'high',
      isAnonymous: false,
      reporterName: 'Alice',
      reporterEmail: 'a@b.com',
      subject: 'Bug critique',
      message: 'detail',
    });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('?wait=true');

    const body = JSON.parse(opts.body);
    expect(body.content).toContain('<@&777>');
    expect(body.allowed_mentions.roles).toEqual(['777']);
    expect(out.messageId).toBe('msg-9');
  });

  it('low severity posts silently (no role mention, no allowed roles)', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: '777' });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifySupportTicket({
      ticketId: 't',
      tournamentId: null,
      category: 'other',
      severity: 'low',
      isAnonymous: true,
      reporterName: null,
      reporterEmail: null,
      subject: null,
      message: 'plop',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.content).toBeUndefined();
    expect(body.allowed_mentions.roles).toEqual([]);
  });

  it('truncates messages over 1500 chars and appends an ellipsis marker', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifySupportTicket({
      ticketId: 't',
      tournamentId: null,
      category: 'technical',
      severity: 'medium',
      isAnonymous: false,
      reporterName: 'X',
      reporterEmail: null,
      subject: 'A',
      message: 'x'.repeat(2000),
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds[0].description.length).toBeLessThanOrEqual(2000);
    expect(body.embeds[0].description).toContain('tronqué');
  });

  it('marks anonymous reports in the Auteur field', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await notifySupportTicket({
      ticketId: 't',
      tournamentId: null,
      category: 'behavior',
      severity: 'medium',
      isAnonymous: true,
      reporterName: 'should be ignored',
      reporterEmail: 'should@be.ignored',
      subject: null,
      message: 'msg',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const auteur = body.embeds[0].fields.find((f: any) => f.name === 'Auteur');
    expect(auteur.value).toContain('anonyme');
  });
});

/* -----------------------------------------------------------
 * postMvpPoll
 * ---------------------------------------------------------*/

describe('postMvpPoll', () => {
  it('skips if no webhook is configured', async () => {
    setNextWebhook(null);
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const out = await postMvpPoll({
      tournamentId: null,
      matchId: 'm',
      team1Name: 'A',
      team2Name: 'B',
      candidates: [{ displayLabel: 'X' }, { displayLabel: 'Y' }],
    });

    expect(out).toEqual({ messageId: null, posted: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips when fewer than 2 candidates are provided', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const out = await postMvpPoll({
      tournamentId: null,
      matchId: 'm-12345678',
      team1Name: 'A',
      team2Name: 'B',
      candidates: [{ displayLabel: 'Solo' }],
    });

    expect(out.posted).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('caps to 10 answers and truncates labels at 55 chars', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk({ id: 'poll-1' }));
    vi.stubGlobal('fetch', mockFetch);

    const candidates = Array.from({ length: 15 }, (_, i) => ({
      displayLabel: `${'a'.repeat(60)}-${i}`,
    }));

    const out = await postMvpPoll({
      tournamentId: null,
      matchId: 'm-12345678',
      team1Name: 'A',
      team2Name: 'B',
      candidates,
    });

    expect(out).toEqual({ messageId: 'poll-1', posted: true });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.poll.answers).toHaveLength(10);
    for (const a of body.poll.answers) {
      expect(a.poll_media.text.length).toBeLessThanOrEqual(55);
    }
  });

  it('clamps duration into the [1, 768] hour range', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    const mockFetch = vi.fn().mockResolvedValue(jsonOk());
    vi.stubGlobal('fetch', mockFetch);

    await postMvpPoll({
      tournamentId: null,
      matchId: 'm-12345678',
      team1Name: 'A',
      team2Name: 'B',
      candidates: [{ displayLabel: 'X' }, { displayLabel: 'Y' }],
      durationHours: 9999,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.poll.duration).toBe(768);

    mockFetch.mockClear();
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });

    await postMvpPoll({
      tournamentId: null,
      matchId: 'm-12345678',
      team1Name: 'A',
      team2Name: 'B',
      candidates: [{ displayLabel: 'X' }, { displayLabel: 'Y' }],
      durationHours: 0,
    });

    const body2 = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body2.poll.duration).toBe(1);
  });

  it('returns posted: false when Discord rejects the request', async () => {
    setNextWebhook({ webhook_url: 'https://x', role_mention: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nonOk(400, 'bad')));

    const out = await postMvpPoll({
      tournamentId: null,
      matchId: 'm-12345678',
      team1Name: 'A',
      team2Name: 'B',
      candidates: [{ displayLabel: 'X' }, { displayLabel: 'Y' }],
    });

    expect(out).toEqual({ messageId: null, posted: false });
  });
});
