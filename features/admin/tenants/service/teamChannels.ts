// features/admin/tenants/service/teamChannels.ts — salons Discord d'équipe
// pilotés DEPUIS L'ADMIN (remplace le cron `team-channel-reconcile`, supprimé
// après avoir détruit puis recréé des salons tout seul).
//
// Le site n'a pas le token Discord : chaque action part en événement vers le
// bot (`emitBotEvent`), qui exécute et repose une photo fraîche.

import * as z from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { AuditDetails } from '@/utils/admin/defineAdminRoute';
import { LegacyAdminError } from '@/utils/admin/errors';
import type { StaffLogAction } from '@/utils/staffLogs';
import { emitBotEvent, type BotEventName } from '@/utils/botEvents';
import * as repo from '../repository/teamChannels';

const discordId = z
  .string()
  .trim()
  .regex(/^[0-9]{15,25}$/, 'Discord ID invalide.');

/** Une action = un geste nommé. Pas de « réconcilie ». */
const bodySchema = z.discriminatedUnion('action', [
  // Lecture. `teamId` absent = tout le monde.
  z.object({
    action: z.literal('refresh'),
    teamId: z.string().uuid().optional(),
  }),
  // Crée ce qui manque (idempotent côté bot).
  z.object({ action: z.literal('provision'), teamId: z.string().uuid() }),
  // Repose les permissions cibles, sans rien créer.
  z.object({ action: z.literal('repair'), teamId: z.string().uuid() }),
  // Suppressions : jamais automatiques, seulement demandées ici et tracées.
  z.object({
    action: z.literal('delete-channel'),
    teamId: z.string().uuid(),
    channel: z.enum(['text', 'voice']),
  }),
  z.object({ action: z.literal('delete-role'), teamId: z.string().uuid() }),
  // Accès individuel à UN salon (coach externe, caster invité).
  z.object({
    action: z.literal('grant-access'),
    teamId: z.string().uuid(),
    channel: z.enum(['text', 'voice']),
    discordUserId: discordId,
  }),
  z.object({
    action: z.literal('revoke-access'),
    teamId: z.string().uuid(),
    channel: z.enum(['text', 'voice']),
    discordUserId: discordId,
  }),
  // Rôle d'équipe : ouvre les deux salons d'un coup.
  z.object({
    action: z.literal('grant-role'),
    teamId: z.string().uuid(),
    discordUserId: discordId,
  }),
  z.object({
    action: z.literal('revoke-role'),
    teamId: z.string().uuid(),
    discordUserId: discordId,
  }),
]);

type Body = z.infer<typeof bodySchema>;

/** Action admin → slug de journal (union fermée, table explicite). */
const LOG_ACTION_BY_ACTION: Record<
  Body['action'],
  Exclude<StaffLogAction, 'other'>
> = {
  refresh: 'discord_refresh',
  provision: 'discord_provision',
  repair: 'discord_repair',
  'delete-channel': 'discord_delete_channel',
  'delete-role': 'discord_delete_role',
  'grant-access': 'discord_grant_access',
  'revoke-access': 'discord_revoke_access',
  'grant-role': 'discord_grant_role',
  'revoke-role': 'discord_revoke_role',
};

/** Action admin → événement bot. Un geste, un événement. */
const EVENT_BY_ACTION: Record<Body['action'], BotEventName> = {
  refresh: 'team.channels.snapshot.request',
  provision: 'team.channels.provision',
  repair: 'team.channels.repair',
  'delete-channel': 'team.channel.deleted',
  'delete-role': 'team.role.deleted',
  'grant-access': 'team.channel.access.granted',
  'revoke-access': 'team.channel.access.revoked',
  'grant-role': 'team.role.granted',
  'revoke-role': 'team.role.revoked',
};

type TeamRow = {
  id: string;
  name: string | null;
  slug: string | null;
  is_active: boolean | null;
  captain_id?: string | null;
  discord_role_id: string | null;
  discord_channel_id: string | null;
  discord_voice_channel_id: string | null;
};

type MemberRow = {
  team_id: string | null;
  user_id: string | null;
  role: string | null;
  battle_tag: string | null;
  display_name: string | null;
};

type RosterEntry = {
  userId: string | null;
  label: string | null;
  role: string | null;
  /** `null` = compte Discord non lié → le bot ne peut rien pour cette personne. */
  discordUserId: string | null;
};

type SnapshotRow = {
  team_id: string;
  role_id: string | null;
  role_name: string | null;
  role_exists: boolean;
  text_channel_id: string | null;
  text_channel_name: string | null;
  text_channel_exists: boolean;
  voice_channel_id: string | null;
  voice_channel_name: string | null;
  voice_channel_exists: boolean;
  access: Array<{
    discordUserId: string;
    username?: string | null;
    source: 'role' | 'text' | 'voice';
  }>;
  warnings: string[];
  captured_at: string;
};

/**
 * GET : par équipe, ce que le SITE croit (`stored`) ET ce que le BOT a vu
 * (`live`, `null` = jamais rafraîchi) — ils divergent, c'est le cas utile.
 */
export async function getTeamChannelsState(ctx: ServiceContext) {
  const {
    teams: teamsRes,
    snapshots: snapsRes,
    members: membersRes,
  } = await repo.loadTeamChannelState(ctx.db, ctx.tenantId);

  if (teamsRes.error) {
    ctx.logger.error(
      '[admin/discord/team-channels] teams error',
      teamsRes.error
    );
    throw new LegacyAdminError(500, 'Erreur de chargement des équipes.');
  }
  // Une photo absente n'est pas une panne : c'est « jamais rafraîchi ».
  if (snapsRes.error) {
    ctx.logger.error(
      '[admin/discord/team-channels] snapshot error',
      snapsRes.error
    );
  }

  const snapshots = new Map<string, SnapshotRow>();
  for (const row of (snapsRes.data ?? []) as unknown as SnapshotRow[]) {
    snapshots.set(row.team_id, row);
  }

  const members = (membersRes.data ?? []) as MemberRow[];
  const authUserIds = [
    ...new Set(members.map((m) => m.user_id).filter(Boolean) as string[]),
  ];
  const discordByUser = new Map<string, string>();
  if (authUserIds.length > 0) {
    for (const l of await repo.listDiscordLinks(ctx.db, authUserIds)) {
      if (l.auth_user_id && l.discord_user_id) {
        discordByUser.set(l.auth_user_id, l.discord_user_id);
      }
    }
  }

  const rosterByTeam = new Map<string, RosterEntry[]>();
  for (const m of members) {
    if (!m.team_id) continue;
    const list = rosterByTeam.get(m.team_id) ?? [];
    list.push({
      userId: m.user_id,
      label: m.display_name || m.battle_tag || null,
      role: m.role,
      discordUserId: m.user_id ? (discordByUser.get(m.user_id) ?? null) : null,
    });
    rosterByTeam.set(m.team_id, list);
  }

  const teams = ((teamsRes.data ?? []) as TeamRow[]).map((team) => {
    const snap = snapshots.get(team.id) ?? null;
    const roster = rosterByTeam.get(team.id) ?? [];
    const withAccess = new Set(
      (snap?.access ?? []).map((a) => a.discordUserId)
    );
    return {
      teamId: team.id,
      name: team.name,
      slug: team.slug,
      isActive: team.is_active === true,
      roster: roster.map((r) => ({
        ...r,
        isCaptain: Boolean(r.userId) && r.userId === team.captain_id,
        // Indéterminé tant qu'aucune photo n'existe.
        hasAccess: snap
          ? Boolean(r.discordUserId && withAccess.has(r.discordUserId))
          : null,
      })),
      stored: {
        roleId: team.discord_role_id,
        textChannelId: team.discord_channel_id,
        voiceChannelId: team.discord_voice_channel_id,
      },
      live: snap
        ? {
            roleId: snap.role_id,
            roleName: snap.role_name,
            roleExists: snap.role_exists,
            textChannelId: snap.text_channel_id,
            textChannelName: snap.text_channel_name,
            textChannelExists: snap.text_channel_exists,
            voiceChannelId: snap.voice_channel_id,
            voiceChannelName: snap.voice_channel_name,
            voiceChannelExists: snap.voice_channel_exists,
            access: snap.access ?? [],
            warnings: snap.warnings ?? [],
            capturedAt: snap.captured_at,
          }
        : null,
    };
  });

  return { teams };
}

/**
 * POST : une action demandée par quelqu'un → un événement bot, journalisé
 * (slug par action). `delivered: false` n'est pas un échec : l'événement est
 * en outbox et le bot le prendra à son prochain tick.
 */
export async function requestTeamChannelAction(
  ctx: ServiceContext,
  raw: unknown,
  staffId: string
): Promise<{
  result: { accepted: true; delivered: boolean; action: Body['action'] };
  audit: AuditDetails;
}> {
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(
      400,
      'Action inconnue ou paramètres invalides.',
      { code: 'INVALID_BODY' }
    );
  }
  const body = parsed.data;
  const teamId = 'teamId' in body && body.teamId ? body.teamId : null;

  // Le contexte Discord voyage AVEC l'événement (un aller-retour de moins).
  const { rows, error } = await repo.listTeamsForDiscordAction(
    ctx.db,
    ctx.tenantId,
    teamId
  );
  if (error) {
    ctx.logger.error('[admin/discord/team-channels] teams load error', error);
    throw new LegacyAdminError(500, 'Erreur de chargement des équipes.');
  }
  if (teamId && rows.length === 0) {
    throw new LegacyAdminError(404, 'Équipe introuvable.', {
      code: 'TEAM_NOT_FOUND',
    });
  }

  const teams = rows.map((t) => ({
    teamId: t.id,
    name: t.name,
    slug: t.slug,
    discordRoleId: t.discord_role_id,
    discordChannelId: t.discord_channel_id,
    discordVoiceChannelId: t.discord_voice_channel_id,
  }));

  const { action, ...rest } = body;
  const sent = await emitBotEvent(
    EVENT_BY_ACTION[action],
    { ...rest, teams, requestedByStaffId: staffId },
    ctx.tenantId
  );

  return {
    result: { accepted: true, delivered: sent.delivered, action },
    audit: {
      action: LOG_ACTION_BY_ACTION[action],
      entity_type: 'team',
      entity_id: 'teamId' in body ? (body.teamId ?? null) : null,
      payload: { ...rest, delivered: sent.delivered },
    },
  };
}
