// utils/discord/channels.ts
// Source unique des types de channel Discord et de leurs metadonnees.
// Importe par :
//   - utils/discord.ts (resolution / postage)
//   - pages/api/admin/tournament/[id]/discord-* (CRUD per-tournoi)
//   - pages/api/admin/site-settings/discord-* (CRUD global)
//   - pages/admin/tournament/[id]/discord.tsx (UI per-tournoi)
//   - pages/admin/site-settings/discord.tsx (UI global)
//
// La table `discord_webhooks` accepte les memes channel_type pour les
// configurations per-tournoi (tournament_id non null) et globales
// (tournament_id IS NULL — utilise comme fallback).

export const DISCORD_CHANNEL_TYPES = [
  'match_announcements',
  'match_results',
  'bracket_updates',
  'veto_live',
  'checkin_reminders',
  'support_tickets',
  'mvp_polls',
] as const;

export type DiscordChannelType = (typeof DISCORD_CHANNEL_TYPES)[number];

export function isDiscordChannelType(v: unknown): v is DiscordChannelType {
  return (
    typeof v === 'string' &&
    (DISCORD_CHANNEL_TYPES as readonly string[]).includes(v)
  );
}

export type DiscordChannelMeta = {
  label: string;
  description: string;
};

export const DISCORD_CHANNEL_META: Record<
  DiscordChannelType,
  DiscordChannelMeta
> = {
  match_announcements: {
    label: 'Annonces de match',
    description:
      'Ping J-15min : code lobby, stream URL, ping des deux équipes (rôles Discord).',
  },
  match_results: {
    label: 'Résultats de match',
    description:
      'Embed avec score final + équipe gagnante (et logo) à chaque match terminé.',
  },
  bracket_updates: {
    label: 'Mise à jour bracket',
    description:
      'Annonce de progression : qui avance, prochain round, prochain adversaire.',
  },
  veto_live: {
    label: 'Veto en direct',
    description: "Un message par étape : ban, pick, decider — au fil de l'eau.",
  },
  checkin_reminders: {
    label: 'Rappels check-in',
    description:
      'Rappels T-30min / T-15min avant chaque match + annonce de forfait auto à T-0.',
  },
  support_tickets: {
    label: 'Tickets de support',
    description:
      'Signalements (litiges, comportement, technique). Sévérité HAUTE = ping du rôle modération.',
  },
  mvp_polls: {
    label: 'Sondages MVP',
    description:
      'Sondage Discord natif (24h) pour élire la MVP, posté automatiquement à la fin de chaque match.',
  },
};

/**
 * Valide une URL de webhook Discord. Retourne l'URL trimee si OK, null sinon.
 * Discord accepte le domaine principal et 2 alias (ptb / canary / discordapp).
 */
export function sanitizeDiscordWebhookUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (
    !/^https:\/\/(discord|ptb\.discord|canary\.discord|discordapp)\.com\/api\/webhooks\//.test(
      trimmed
    )
  ) {
    return null;
  }
  return trimmed;
}
