// utils/discord.ts
// Helpers for posting notifications to Discord webhooks.
// Webhook URLs are read from the discord_webhooks table (per tournament + channel
// type, with NULL tournament_id as a global fallback). Scrim notifications still
// use DISCORD_SCRIM_WEBHOOK_URL for backwards compatibility.
// All helpers are fire-and-forget: errors are logged but never thrown.

import { supabaseAdmin } from './supabase';

export type DiscordChannelType =
  | 'match_announcements'
  | 'match_results'
  | 'bracket_updates'
  | 'general_announcements'
  | 'veto_live'
  | 'checkin_reminders';

type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  thumbnail?: { url: string };
};

type DiscordWebhookPayload = {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
  allowed_mentions?: {
    parse?: ('roles' | 'users' | 'everyone')[];
    roles?: string[];
    users?: string[];
  };
};

const COLORS = {
  matchAnnouncement: 0x3b82f6, // blue-500
  matchResult: 0x10b981, // emerald-500
  bracket: 0x6366f1, // indigo-500
  announcement: 0xf59e0b, // amber-500
  veto: 0xa855f7, // purple-500
  scrim: 0x06b6d4, // cyan-500
  checkinReminder: 0xef4444, // red-500
  checkinForfeit: 0x991b1b, // red-800
};

/* -----------------------------------------------------------
 * Low-level POST
 * ---------------------------------------------------------*/

export async function postToDiscordWebhook(
  webhookUrl: string,
  payload: DiscordWebhookPayload
): Promise<void> {
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        '[discord] webhook POST failed:',
        res.status,
        text.slice(0, 300)
      );
    }
  } catch (e) {
    console.error('[discord] webhook POST error:', e);
  }
}

/* -----------------------------------------------------------
 * Webhook resolver (DB lookup with global fallback)
 * ---------------------------------------------------------*/

type WebhookConfig = {
  url: string;
  roleMention: string | null;
};

async function resolveWebhook(
  tournamentId: string | null,
  channelType: DiscordChannelType
): Promise<WebhookConfig | null> {
  if (!supabaseAdmin) return null;

  // 1) Try tournament-specific webhook first
  if (tournamentId) {
    const { data: scoped } = await supabaseAdmin
      .from('discord_webhooks')
      .select('webhook_url, role_mention')
      .eq('tournament_id', tournamentId)
      .eq('channel_type', channelType)
      .eq('is_active', true)
      .maybeSingle();

    if (scoped?.webhook_url) {
      return { url: scoped.webhook_url, roleMention: scoped.role_mention ?? null };
    }
  }

  // 2) Fallback: global webhook (tournament_id IS NULL)
  const { data: global } = await supabaseAdmin
    .from('discord_webhooks')
    .select('webhook_url, role_mention')
    .is('tournament_id', null)
    .eq('channel_type', channelType)
    .eq('is_active', true)
    .maybeSingle();

  if (global?.webhook_url) {
    return { url: global.webhook_url, roleMention: global.role_mention ?? null };
  }

  return null;
}

/* -----------------------------------------------------------
 * Mention helpers
 * ---------------------------------------------------------*/

function formatRoleMention(roleMention: string | null | undefined): string {
  if (!roleMention) return '';
  const trimmed = roleMention.trim();
  if (!trimmed) return '';
  if (trimmed === 'everyone' || trimmed === '@everyone') return '@everyone';
  if (trimmed === 'here' || trimmed === '@here') return '@here';
  // Allow the user to enter either a raw ID or the full <@&id> form
  if (/^<@&\d+>$/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `<@&${trimmed}>`;
  return trimmed;
}

function teamRolePing(discordRoleId: string | null | undefined, fallbackName: string): string {
  if (discordRoleId && /^\d+$/.test(discordRoleId.trim())) {
    return `<@&${discordRoleId.trim()}>`;
  }
  return `**${fallbackName}**`;
}

function buildAllowedMentions(
  channelMention: string | null | undefined,
  teamRoleIds: (string | null | undefined)[] = []
): DiscordWebhookPayload['allowed_mentions'] {
  const roles = new Set<string>();
  const parse: ('roles' | 'users' | 'everyone')[] = [];

  for (const id of teamRoleIds) {
    if (id && /^\d+$/.test(id.trim())) roles.add(id.trim());
  }

  if (channelMention) {
    const m = channelMention.trim();
    if (m === 'everyone' || m === '@everyone' || m === 'here' || m === '@here') {
      parse.push('everyone');
    } else if (/^\d+$/.test(m)) {
      roles.add(m);
    } else {
      const match = m.match(/^<@&(\d+)>$/);
      if (match) roles.add(match[1]);
    }
  }

  return {
    parse,
    roles: Array.from(roles),
  };
}

function formatDateFr(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

/* -----------------------------------------------------------
 * Existing helper: scrim request
 * ---------------------------------------------------------*/

export type ScrimNotification = {
  fromTeamName: string;
  targetTeamName: string;
  preferredDate?: string | null;
  message?: string | null;
  requesterDisplayName?: string | null;
};

export async function notifyScrimRequest(
  data: ScrimNotification
): Promise<void> {
  const webhookUrl = process.env.DISCORD_SCRIM_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[discord] DISCORD_SCRIM_WEBHOOK_URL not configured');
    return;
  }

  const fields: DiscordEmbedField[] = [
    { name: 'Équipe demandeuse', value: data.fromTeamName, inline: true },
    { name: 'Équipe cible', value: data.targetTeamName, inline: true },
  ];

  const dateLabel = formatDateFr(data.preferredDate);
  if (dateLabel) {
    fields.push({ name: 'Date souhaitée', value: dateLabel, inline: false });
  }

  if (data.message) {
    fields.push({
      name: 'Message',
      value: data.message.slice(0, 1000),
      inline: false,
    });
  }

  if (data.requesterDisplayName) {
    fields.push({
      name: 'Capitaine',
      value: data.requesterDisplayName,
      inline: true,
    });
  }

  await postToDiscordWebhook(webhookUrl, {
    username: "OW Women's Cup — Scrims",
    embeds: [
      {
        title: '🎯 Nouvelle demande de scrim',
        description: `**${data.fromTeamName}** souhaite affronter **${data.targetTeamName}**.`,
        color: COLORS.scrim,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'À traiter dans /admin/demandes' },
      },
    ],
  });
}

/* -----------------------------------------------------------
 * Match starting (status -> ongoing)
 * ---------------------------------------------------------*/

export type MatchStartingNotification = {
  tournamentId: string | null;
  tournamentName?: string | null;
  matchId: string;
  roundName?: string | null;
  team1: { name: string; logoUrl?: string | null; discordRoleId?: string | null };
  team2: { name: string; logoUrl?: string | null; discordRoleId?: string | null };
  lobbyCode?: string | null;
  streamUrl?: string | null;
  scheduledAt?: string | null;
  matchFormat?: string | null;
};

export async function notifyMatchStarting(
  data: MatchStartingNotification
): Promise<void> {
  const cfg = await resolveWebhook(data.tournamentId, 'match_announcements');
  if (!cfg) return;

  const team1Ping = teamRolePing(data.team1.discordRoleId, data.team1.name);
  const team2Ping = teamRolePing(data.team2.discordRoleId, data.team2.name);
  const channelPing = formatRoleMention(cfg.roleMention);

  const fields: DiscordEmbedField[] = [];
  if (data.matchFormat) {
    fields.push({ name: 'Format', value: data.matchFormat.toUpperCase(), inline: true });
  }
  if (data.roundName) {
    fields.push({ name: 'Round', value: data.roundName, inline: true });
  }
  const dateLabel = formatDateFr(data.scheduledAt);
  if (dateLabel) {
    fields.push({ name: 'Programmé', value: dateLabel, inline: true });
  }
  if (data.lobbyCode) {
    fields.push({ name: 'Code lobby', value: `\`${data.lobbyCode}\``, inline: true });
  }
  if (data.streamUrl) {
    fields.push({ name: 'Stream', value: data.streamUrl, inline: false });
  }

  const contentParts = [team1Ping, 'vs', team2Ping];
  if (channelPing) contentParts.unshift(channelPing);

  await postToDiscordWebhook(cfg.url, {
    username: "OW Women's Cup",
    content: contentParts.join(' '),
    embeds: [
      {
        title: '🚦 Match en cours de lancement',
        description: `**${data.team1.name}** affronte **${data.team2.name}**${data.tournamentName ? ` — *${data.tournamentName}*` : ''}.`,
        color: COLORS.matchAnnouncement,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: `Match ${data.matchId.slice(0, 8)}` },
      },
    ],
    allowed_mentions: buildAllowedMentions(cfg.roleMention, [
      data.team1.discordRoleId,
      data.team2.discordRoleId,
    ]),
  });
}

/* -----------------------------------------------------------
 * Match result (finished / walkover)
 * ---------------------------------------------------------*/

export type MatchResultNotification = {
  tournamentId: string | null;
  tournamentName?: string | null;
  matchId: string;
  roundName?: string | null;
  team1: { name: string; logoUrl?: string | null };
  team2: { name: string; logoUrl?: string | null };
  team1Score: number;
  team2Score: number;
  winnerTeamId: string | null;
  team1Id: string | null;
  team2Id: string | null;
  isForfeit?: boolean;
};

export async function notifyMatchResult(
  data: MatchResultNotification
): Promise<void> {
  const cfg = await resolveWebhook(data.tournamentId, 'match_results');
  if (!cfg) return;

  const winnerName =
    data.winnerTeamId === data.team1Id
      ? data.team1.name
      : data.winnerTeamId === data.team2Id
        ? data.team2.name
        : null;

  const winnerLogo =
    data.winnerTeamId === data.team1Id
      ? data.team1.logoUrl
      : data.winnerTeamId === data.team2Id
        ? data.team2.logoUrl
        : null;

  const fields: DiscordEmbedField[] = [
    {
      name: data.team1.name,
      value: String(data.team1Score),
      inline: true,
    },
    {
      name: data.team2.name,
      value: String(data.team2Score),
      inline: true,
    },
  ];

  if (data.roundName) {
    fields.push({ name: 'Round', value: data.roundName, inline: false });
  }

  const title = data.isForfeit ? '🚷 Forfait' : '🏆 Résultat du match';
  const description = winnerName
    ? `**${winnerName}** l'emporte ${data.team1Score}-${data.team2Score}${data.isForfeit ? ' (forfait)' : ''}.`
    : `Match terminé : ${data.team1.name} ${data.team1Score} - ${data.team2Score} ${data.team2.name}.`;

  const channelPing = formatRoleMention(cfg.roleMention);

  await postToDiscordWebhook(cfg.url, {
    username: "OW Women's Cup",
    content: channelPing || undefined,
    embeds: [
      {
        title,
        description,
        color: COLORS.matchResult,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: data.tournamentName || `Match ${data.matchId.slice(0, 8)}` },
        ...(winnerLogo ? { thumbnail: { url: winnerLogo } } : {}),
      },
    ],
    allowed_mentions: buildAllowedMentions(cfg.roleMention),
  });
}

/* -----------------------------------------------------------
 * Bracket update (after propagation)
 * ---------------------------------------------------------*/

export type BracketUpdateNotification = {
  tournamentId: string | null;
  tournamentName?: string | null;
  winnerName: string;
  loserName?: string | null;
  nextRoundName?: string | null;
  nextOpponentName?: string | null;
};

export async function notifyBracketUpdate(
  data: BracketUpdateNotification
): Promise<void> {
  const cfg = await resolveWebhook(data.tournamentId, 'bracket_updates');
  if (!cfg) return;

  const fields: DiscordEmbedField[] = [];
  if (data.loserName) {
    fields.push({ name: 'Éliminée / battue', value: data.loserName, inline: true });
  }
  if (data.nextRoundName) {
    fields.push({ name: 'Prochain round', value: data.nextRoundName, inline: true });
  }
  if (data.nextOpponentName) {
    fields.push({ name: 'Prochain adversaire', value: data.nextOpponentName, inline: false });
  }

  const channelPing = formatRoleMention(cfg.roleMention);

  await postToDiscordWebhook(cfg.url, {
    username: "OW Women's Cup",
    content: channelPing || undefined,
    embeds: [
      {
        title: '🔁 Bracket mis à jour',
        description: `**${data.winnerName}** avance dans le bracket.`,
        color: COLORS.bracket,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: data.tournamentName || 'Bracket' },
      },
    ],
    allowed_mentions: buildAllowedMentions(cfg.roleMention),
  });
}

/* -----------------------------------------------------------
 * Announcement crosspost
 * ---------------------------------------------------------*/

export type AnnouncementCrosspost = {
  tournamentId?: string | null;
  title: string;
  message: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

export async function notifyAnnouncement(
  data: AnnouncementCrosspost
): Promise<void> {
  const cfg = await resolveWebhook(data.tournamentId ?? null, 'general_announcements');
  if (!cfg) return;

  const description = data.message.slice(0, 2000);
  const fields: DiscordEmbedField[] = [];
  if (data.ctaLabel && data.ctaUrl) {
    fields.push({ name: data.ctaLabel, value: data.ctaUrl, inline: false });
  } else if (data.ctaUrl) {
    fields.push({ name: 'Lien', value: data.ctaUrl, inline: false });
  }

  const channelPing = formatRoleMention(cfg.roleMention);

  await postToDiscordWebhook(cfg.url, {
    username: "OW Women's Cup",
    content: channelPing || undefined,
    embeds: [
      {
        title: `📢 ${data.title}`,
        description,
        color: COLORS.announcement,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: buildAllowedMentions(cfg.roleMention),
  });
}

/* -----------------------------------------------------------
 * Veto step
 * ---------------------------------------------------------*/

export type VetoStepNotification = {
  tournamentId: string | null;
  matchId: string;
  team1Name: string;
  team2Name: string;
  stepNumber: number;
  totalSteps: number;
  action: 'ban' | 'pick' | 'decider';
  mapName: string;
  byTeamName?: string | null;
  isComplete: boolean;
};

export type CheckinReminderNotification = {
  tournamentId: string | null;
  matchId: string;
  teamName: string;
  teamRoleId: string | null | undefined;
  opponentName: string;
  scheduledAt: string;
  minutesBeforeKickoff: number; // 30 or 15
  checkinUrl: string;
};

export async function notifyCheckinReminder(
  data: CheckinReminderNotification
): Promise<void> {
  const cfg = await resolveWebhook(data.tournamentId, 'checkin_reminders');
  if (!cfg) return;

  const teamPing = teamRolePing(data.teamRoleId, data.teamName);
  const channelPing = formatRoleMention(cfg.roleMention);

  const fields: DiscordEmbedField[] = [
    { name: 'Adversaire', value: data.opponentName, inline: true },
  ];
  const dateLabel = formatDateFr(data.scheduledAt);
  if (dateLabel) {
    fields.push({ name: 'Début', value: dateLabel, inline: true });
  }
  fields.push({
    name: 'Lien check-in',
    value: data.checkinUrl,
    inline: false,
  });

  const contentParts = [teamPing];
  if (channelPing) contentParts.unshift(channelPing);

  const minutes = data.minutesBeforeKickoff;
  const isUrgent = minutes <= 15;

  await postToDiscordWebhook(cfg.url, {
    username: "OW Women's Cup",
    content: contentParts.join(' '),
    embeds: [
      {
        title: isUrgent
          ? `⚠️ Check-in : il reste ${minutes} minutes`
          : `⏰ Rappel check-in (${minutes} min)`,
        description: `**${data.teamName}** doit confirmer sa présence pour le match contre **${data.opponentName}**.`,
        color: COLORS.checkinReminder,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: `Match ${data.matchId.slice(0, 8)}` },
      },
    ],
    allowed_mentions: buildAllowedMentions(cfg.roleMention, [data.teamRoleId]),
  });
}

export type CheckinForfeitNotification = {
  tournamentId: string | null;
  matchId: string;
  forfeitedTeamName: string;
  forfeitedTeamRoleId: string | null | undefined;
  opponentName: string;
};

export async function notifyCheckinForfeit(
  data: CheckinForfeitNotification
): Promise<void> {
  const cfg = await resolveWebhook(data.tournamentId, 'checkin_reminders');
  if (!cfg) return;

  const teamPing = teamRolePing(data.forfeitedTeamRoleId, data.forfeitedTeamName);
  const channelPing = formatRoleMention(cfg.roleMention);

  await postToDiscordWebhook(cfg.url, {
    username: "OW Women's Cup",
    content: [channelPing, teamPing].filter(Boolean).join(' '),
    embeds: [
      {
        title: '🚷 Forfait automatique (no check-in)',
        description: `**${data.forfeitedTeamName}** n'a pas confirmé sa présence à temps. Le match est attribué à **${data.opponentName}**.`,
        color: COLORS.checkinForfeit,
        timestamp: new Date().toISOString(),
        footer: { text: `Match ${data.matchId.slice(0, 8)}` },
      },
    ],
    allowed_mentions: buildAllowedMentions(cfg.roleMention, [data.forfeitedTeamRoleId]),
  });
}

export async function notifyVetoStep(
  data: VetoStepNotification
): Promise<void> {
  const cfg = await resolveWebhook(data.tournamentId, 'veto_live');
  if (!cfg) return;

  const actionLabels: Record<typeof data.action, string> = {
    ban: '❌ Ban',
    pick: '✅ Pick',
    decider: '⭐ Decider',
  };

  const author = data.byTeamName
    ? `**${data.byTeamName}**`
    : data.action === 'decider'
      ? 'Système'
      : 'Inconnu';

  const description = `${author} — ${actionLabels[data.action]} : **${data.mapName}**`;

  const channelPing = formatRoleMention(cfg.roleMention);

  await postToDiscordWebhook(cfg.url, {
    username: "OW Women's Cup",
    content: channelPing || undefined,
    embeds: [
      {
        title: `🗺️ Veto — étape ${data.stepNumber}/${data.totalSteps}${data.isComplete ? ' (terminé)' : ''}`,
        description,
        color: COLORS.veto,
        fields: [
          {
            name: 'Match',
            value: `${data.team1Name} vs ${data.team2Name}`,
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: `Match ${data.matchId.slice(0, 8)}` },
      },
    ],
    allowed_mentions: buildAllowedMentions(cfg.roleMention),
  });
}
