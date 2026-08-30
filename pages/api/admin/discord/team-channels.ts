// pages/api/admin/discord/team-channels.ts
//
// Gestion des salons Discord d'équipe DEPUIS L'ADMIN.
//
//   GET  → l'état de chaque équipe : ce que le site a enregistré
//          (`teams.discord_*`) ET ce que le bot a vu la dernière fois
//          (`team_discord_channels`). Les deux, parce qu'ils divergent : un id
//          stocké peut pointer sur un salon supprimé, et c'est précisément le
//          cas qu'on veut voir.
//   POST → une action, une seule, demandée par quelqu'un.
//
// Remplace le cron `team-channel-reconcile`, supprimé. En deux heures il avait
// détruit les salons d'une équipe vivante puis recréé des salons dont personne
// ne voulait — les deux fois avec un code défendable. Ce n'est pas la logique
// qui était en cause, c'est le fait d'agir seul sur une heuristique.
//
// Le site n'a pas le token Discord : chaque action part en événement vers le
// bot (`emitBotEvent` → push HMAC, outbox en repli), qui exécute et repose une
// photo fraîche. L'admin ne pilote donc pas Discord directement, il le demande.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction, type StaffLogAction } from '@/utils/staffLogs';
import { emitBotEvent, type BotEventName } from '@/utils/botEvents';
import { logger } from '@/utils/logger';

const discordId = z
  .string()
  .trim()
  .regex(/^[0-9]{15,25}$/, 'Discord ID invalide.');

/**
 * Une action = un geste nommé. Pas de « réconcilie » : c'est exactement le mot
 * qui a coûté des salons, parce qu'il laisse la machine décider de ce qu'il
 * faut faire. Ici l'admin dit quoi faire, et à quoi.
 */
const bodySchema = z.discriminatedUnion('action', [
  // Lecture. `teamId` absent = tout le monde.
  z.object({
    action: z.literal('refresh'),
    teamId: z.string().uuid().optional(),
  }),
  // Crée ce qui manque (rôle, salon texte, salon vocal). Idempotent côté bot :
  // ce qui existe est réutilisé, jamais dupliqué.
  z.object({ action: z.literal('provision'), teamId: z.string().uuid() }),
  // Repose les permissions cibles sur les deux salons, sans rien créer.
  z.object({ action: z.literal('repair'), teamId: z.string().uuid() }),
  // Suppression : le bot ne la fait plus jamais de lui-même. Ici elle est
  // demandée, tracée, et c'est la seule façon d'en obtenir une.
  z.object({
    action: z.literal('delete-channel'),
    teamId: z.string().uuid(),
    channel: z.enum(['text', 'voice']),
  }),
  // Accès individuel à UN salon (coach externe, caster invité) — sans donner
  // le rôle d'équipe, qui ouvre les deux salons et marque l'appartenance.
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

/**
 * Action admin → slug de journal. Table explicite plutôt qu'un `discord_${…}`
 * calculé : `StaffLogAction` est une union fermée, et la calculer laisserait
 * passer un slug inconnu du dictionnaire de libellés.
 */
const LOG_ACTION_BY_ACTION: Record<Body['action'], StaffLogAction> = {
  refresh: 'discord_refresh',
  provision: 'discord_provision',
  repair: 'discord_repair',
  'delete-channel': 'discord_delete_channel',
  'grant-access': 'discord_grant_access',
  'revoke-access': 'discord_revoke_access',
  'grant-role': 'discord_grant_role',
  'revoke-role': 'discord_revoke_role',
};

/** Action admin → événement bot. Un geste, un événement, pas d'agrégat. */
const EVENT_BY_ACTION: Record<Body['action'], BotEventName> = {
  refresh: 'team.channels.snapshot.request',
  provision: 'team.channels.provision',
  repair: 'team.channels.repair',
  'delete-channel': 'team.channel.deleted',
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
  discord_role_id: string | null;
  discord_channel_id: string | null;
  discord_voice_channel_id: string | null;
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

async function handleGet(res: NextApiResponse, ctx: AuthenticatedStaffContext) {
  const tenantId = ctx.tenantId;

  const [teamsRes, snapsRes] = await Promise.all([
    supabaseAdmin
      .from('teams')
      .select(
        'id, name, slug, is_active, discord_role_id, discord_channel_id, discord_voice_channel_id'
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('team_discord_channels')
      .select('*')
      .eq('tenant_id', tenantId),
  ]);

  if (teamsRes.error) {
    logger.error('[admin/discord/team-channels] teams error', teamsRes.error);
    return res.status(500).json({ error: 'Erreur de chargement des équipes.' });
  }
  // Une photo absente n'est pas une panne : c'est « jamais rafraîchi ». On sert
  // quand même la liste, l'écran le dira.
  if (snapsRes.error) {
    logger.error(
      '[admin/discord/team-channels] snapshot error',
      snapsRes.error
    );
  }

  const snapshots = new Map<string, SnapshotRow>();
  for (const row of (snapsRes.data ?? []) as SnapshotRow[]) {
    snapshots.set(row.team_id, row);
  }

  const teams = ((teamsRes.data ?? []) as TeamRow[]).map((team) => {
    const snap = snapshots.get(team.id) ?? null;
    return {
      teamId: team.id,
      name: team.name,
      slug: team.slug,
      isActive: team.is_active === true,
      // Ce que le SITE croit.
      stored: {
        roleId: team.discord_role_id,
        textChannelId: team.discord_channel_id,
        voiceChannelId: team.discord_voice_channel_id,
      },
      // Ce que le BOT a vu. `null` = jamais rafraîchi.
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

  return res.status(200).json({ teams });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        error: 'Action inconnue ou paramètres invalides.',
        code: 'INVALID_BODY',
      });
  }
  const body = parsed.data;
  const tenantId = ctx.tenantId;

  // Le contexte Discord voyage AVEC l'événement plutôt que d'être rappelé au
  // site par le bot : le site le connaît déjà, et un aller-retour de moins,
  // c'est une occasion de moins de travailler sur une vue périmée.
  const teamsQuery = supabaseAdmin
    .from('teams')
    .select(
      'id, name, slug, discord_role_id, discord_channel_id, discord_voice_channel_id'
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  const { data: teamRows, error: teamsErr } =
    'teamId' in body && body.teamId
      ? await teamsQuery.eq('id', body.teamId)
      : await teamsQuery;

  if (teamsErr) {
    logger.error('[admin/discord/team-channels] teams load error', teamsErr);
    return res.status(500).json({ error: 'Erreur de chargement des équipes.' });
  }
  if ('teamId' in body && body.teamId && (teamRows ?? []).length === 0) {
    return res
      .status(404)
      .json({ error: 'Équipe introuvable.', code: 'TEAM_NOT_FOUND' });
  }

  const teams = ((teamRows ?? []) as TeamRow[]).map((t) => ({
    teamId: t.id,
    name: t.name,
    slug: t.slug,
    discordRoleId: t.discord_role_id,
    discordChannelId: t.discord_channel_id,
    discordVoiceChannelId: t.discord_voice_channel_id,
  }));

  const { action, ...rest } = body;
  const result = await emitBotEvent(
    EVENT_BY_ACTION[action],
    { ...rest, teams, requestedByStaffId: ctx.staff.id },
    tenantId
  );

  // Toute action Discord déclenchée par un humain est journalisée : c'est ce
  // qui manquait quand le cron agissait seul — personne ne pouvait dire qui
  // avait supprimé quoi, ni pourquoi.
  void logStaffAction({
    staff_id: ctx.staff.id,
    action: LOG_ACTION_BY_ACTION[action],
    entity_type: 'team',
    entity_id: 'teamId' in body ? (body.teamId ?? null) : null,
    tenant_id: tenantId,
    payload: { ...rest, delivered: result.delivered },
  });

  // `delivered: false` n'est pas un échec : l'événement est en outbox et le bot
  // le prendra à son prochain tick. On le dit, pour que l'écran n'annonce pas
  // un effet immédiat qui n'aura lieu que dans une minute.
  return res.status(202).json({
    accepted: true,
    delivered: result.delivered,
    action,
  });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-discord-channels'
    )
  ) {
    return;
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(res, ctx);
    case 'POST':
      return handlePost(req, res, ctx);
    default:
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withStaffRoute(handler, 'admin');
