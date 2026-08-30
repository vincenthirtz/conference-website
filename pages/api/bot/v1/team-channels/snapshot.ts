// POST /api/bot/v1/team-channels/snapshot
//
// Le bot dépose ce qu'il VOIT du guild : pour chaque équipe, son rôle et ses
// deux salons existent-ils vraiment, et qui peut entrer.
//
// Seul le bot a le token Discord. Le site, lui, ne connaît que des ids stockés
// dans `teams.discord_*` — qui peuvent parfaitement pointer sur un salon
// supprimé, et c'est même le cas qui nous intéresse le plus. Sans cette photo,
// l'écran admin afficherait des ids en se taisant sur leur validité.
//
// Déclenché à la demande depuis l'admin (event `team.channels.snapshot.request`)
// et après chaque action, pour que l'écran reflète le résultat sans qu'on ait à
// deviner.
//
// FULL REPLACE par tenant, comme role-sync/presence : le bot vient de parcourir
// l'ensemble des équipes qu'on lui a demandées, sa vue est complète sur ce
// périmètre. Les lignes absentes du payload sont périmées, pas manquantes.
//
// Auth : x-api-key (per-tenant).

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { discordIdSchema } from '@/utils/botValidation';
import { logger } from '@/utils/logger';

/** Un guild, pas une fédération : le plafond protège d'un payload aberrant. */
const MAX_TEAMS = 500;
const MAX_ACCESS_PER_TEAM = 200;

const accessEntrySchema = z.object({
  discordUserId: discordIdSchema,
  username: z.string().max(120).nullable().optional(),
  /**
   * Par quel chemin la personne entre. `role` = elle a le rôle d'équipe ;
   * `text` / `voice` = permission individuelle posée sur ce salon. La
   * distinction n'est pas cosmétique : on retire au bon endroit, sinon on croit
   * avoir sorti quelqu'un qui rentre encore par l'autre porte.
   */
  source: z.enum(['role', 'text', 'voice']),
});

const teamSnapshotSchema = z.object({
  teamId: z.string().uuid(),
  roleId: discordIdSchema.nullable().optional(),
  roleName: z.string().max(120).nullable().optional(),
  roleExists: z.boolean(),
  textChannelId: discordIdSchema.nullable().optional(),
  textChannelName: z.string().max(120).nullable().optional(),
  textChannelExists: z.boolean(),
  voiceChannelId: discordIdSchema.nullable().optional(),
  voiceChannelName: z.string().max(120).nullable().optional(),
  voiceChannelExists: z.boolean(),
  access: z.array(accessEntrySchema).max(MAX_ACCESS_PER_TEAM).default([]),
  warnings: z.array(z.string().max(300)).max(20).default([]),
});

const bodySchema = z.object({
  teams: z.array(teamSnapshotSchema).max(MAX_TEAMS),
});

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;
  const input = req.botInput as z.infer<typeof bodySchema>;

  if (input.teams.length === 0) {
    return res.status(200).json({ count: 0 });
  }

  const capturedAt = new Date().toISOString();
  const rows = input.teams.map((t) => ({
    team_id: t.teamId,
    tenant_id: tenantId,
    role_id: t.roleId ?? null,
    role_name: t.roleName ?? null,
    role_exists: t.roleExists,
    text_channel_id: t.textChannelId ?? null,
    text_channel_name: t.textChannelName ?? null,
    text_channel_exists: t.textChannelExists,
    voice_channel_id: t.voiceChannelId ?? null,
    voice_channel_name: t.voiceChannelName ?? null,
    voice_channel_exists: t.voiceChannelExists,
    access: t.access,
    warnings: t.warnings,
    captured_at: capturedAt,
  }));

  // Upsert par équipe : le bot peut rafraîchir UNE équipe après une action sans
  // avoir à reposter tout le guild. On ne purge donc pas les autres lignes.
  const { error } = await supabaseAdmin!
    .from('team_discord_channels')
    .upsert(rows, { onConflict: 'team_id' });

  if (error) {
    logger.error('[bot/team-channels/snapshot] upsert error', error);
    return res
      .status(500)
      .json({ error: 'Échec de l’enregistrement de l’état Discord.' });
  }

  return res.status(200).json({ count: rows.length, capturedAt });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 60, key: 'bot-team-channels-snapshot' },
  idempotent: true,
  bodySchema,
});
