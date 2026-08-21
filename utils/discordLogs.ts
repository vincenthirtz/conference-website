// utils/discordLogs.ts
//
// Socle partagé du journal Discord (onglet « Discord » de /admin/logs).
//
// Deux sources, deux directions du même flux bot ↔ site :
//   - 'player' : `bot_player_actions` — ce que les joueuses ont fait DEPUIS
//     Discord (slash commands, boutons) et que le site a exécuté.
//   - 'event'  : `bot_event_outbox`  — ce que le site a demandé AU bot de faire
//     dans Discord (annonces, salons, rôles), avec son état de livraison.
//
// Les libellés FR vivent ici (et pas dans un namespace i18n) pour la même
// raison que `STAFF_LOG_ACTION_LABELS` : ils sont consommés à la fois par l'API
// (export CSV, rendu serveur) et par l'UI. Le garde-fou `noHardcodedFrench` ne
// scanne que pages/ + components/.

import { PLAYER_ACTIONS, type PlayerAction } from './botPlayerLogs';
import { BOT_EVENT_NAMES, type BotEventName } from './botEvents';

export const DISCORD_LOG_SOURCES = ['player', 'event'] as const;
export type DiscordLogSource = (typeof DISCORD_LOG_SOURCES)[number];

export function isDiscordLogSource(v: unknown): v is DiscordLogSource {
  return (
    typeof v === 'string' &&
    (DISCORD_LOG_SOURCES as readonly string[]).includes(v)
  );
}

/** Libellés lisibles des actions joueuses tracées par le bot. */
export const PLAYER_ACTION_LABELS: Record<PlayerAction, string> = {
  create_team: 'Création d’équipe',
  update_team: 'Modification d’équipe',
  invite_create: 'Invitation envoyée',
  invite_accept: 'Invitation acceptée',
  invite_reject: 'Invitation refusée',
  invite_cancel: 'Invitation annulée',
  kick_member: 'Membre exclu',
  transfer_captain: 'Capitanat transféré',
  leave_team: 'Départ d’équipe',
  register_team: 'Inscription d’équipe',
  checkin: 'Check-in',
  report_score: 'Score reporté',
  attach_evidence: 'Preuve jointe',
  update_profile: 'Profil mis à jour',
};

export function playerActionLabel(action: string): string {
  return PLAYER_ACTION_LABELS[action as PlayerAction] ?? action;
}

/** Options triées pour le dropdown « action » (source joueuses). */
export const PLAYER_ACTION_OPTIONS: { value: PlayerAction; label: string }[] = [
  ...PLAYER_ACTIONS,
]
  .map((value) => ({ value, label: PLAYER_ACTION_LABELS[value] }))
  .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

/**
 * Options du dropdown « event » (source sortante). Les noms d'events sont déjà
 * lisibles (`match.starting`) : on les expose bruts, triés alphabétiquement.
 */
export const BOT_EVENT_OPTIONS: { value: BotEventName; label: string }[] = [
  ...BOT_EVENT_NAMES,
]
  .map((value) => ({ value, label: value }))
  .sort((a, b) => a.label.localeCompare(b.label));

/** Statuts possibles d'une row `bot_event_outbox`. */
export const OUTBOX_STATUSES = ['pending', 'delivered', 'failed'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

/**
 * Famille d'un event (préfixe avant le premier point) — sert au regroupement
 * visuel / colorimétrique côté UI. `cast.assigned` → `cast`.
 */
export function botEventFamily(eventName: string): string {
  const dot = eventName.indexOf('.');
  return dot === -1 ? eventName : eventName.slice(0, dot);
}

/**
 * Ligne normalisée renvoyée par GET /api/admin/discord-logs, quelle que soit la
 * source. Les champs spécifiques à une source restent nuls pour l'autre :
 * l'UI n'a qu'un seul type de row à rendre.
 */
export type DiscordLogRow = {
  /** `player:<bigserial>` ou `event:<bigserial>` — unique toutes sources confondues. */
  id: string;
  source: DiscordLogSource;
  created_at: string;
  /** `action` (player) ou `event_name` (event). */
  action: string;
  /** Libellé lisible de `action`. */
  action_label: string;
  entity_type: string | null;
  entity_id: string | null;
  actor: DiscordLogParty | null;
  target: DiscordLogParty | null;
  /** Source 'event' uniquement. */
  status: OutboxStatus | null;
  push_attempts: number | null;
  last_push_error: string | null;
  delivered_at: string | null;
  payload: unknown;
};

export type DiscordLogParty = {
  authUserId: string | null;
  discordUserId: string | null;
  discordUsername: string | null;
};
