// POST /api/bot/v1/tenants/link-guild
//
// Appele par le bot dans son handler `guildCreate` (le bot vient d'etre
// invite sur un nouveau serveur Discord). Idempotent.
//
// Deux cas :
//   1. `discord_guilds` contient deja `guild_id` → renvoie `already_linked`
//      avec le tenant cible. Le bot continue normalement.
//   2. Inconnu → on materialise la demande dans `pending_guild_links`
//      (upsert) et on renvoie `pending_admin_link`. Charge a un admin de
//      passer sur `/admin/tenants` (S7) pour creer ou rattacher.
//
// On NE cree PAS de row dans `discord_guilds` ici : la FK `tenant_id` est
// NOT NULL et il n'y a pas encore de tenant cible. La table dediee
// `pending_guild_links` evite de polluer la table de mapping principale.
//
// EXCEPTION DE SCOPING TENANT_ID : pas de filtre `tenant_id` ici — c'est
// precisement la requete qui va decider quel tenant servir au bot. Cf.
// commentaire dans by-guild/[guildId].ts.
//
// Auth: x-api-key. Pas d'actorDiscordUserId requis (le bot lui-meme est le
// caller, pas un user humain).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

const GUILD_ID_RE = /^[0-9]{15,25}$/;
const GUILD_NAME_MAX = 200;
const OWNER_ID_RE = /^[0-9]{15,25}$/;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const guildId = typeof body.guild_id === 'string' ? body.guild_id.trim() : '';
  if (!guildId || !GUILD_ID_RE.test(guildId)) {
    return res.status(400).json({
      error: 'guild_id requis (snowflake Discord)',
      code: 'INVALID_GUILD_ID',
    });
  }

  const guildName =
    typeof body.guild_name === 'string' && body.guild_name.trim().length > 0
      ? body.guild_name.trim().slice(0, GUILD_NAME_MAX)
      : null;

  let ownerDiscordId: string | null = null;
  if (body.owner_discord_id !== undefined && body.owner_discord_id !== null) {
    if (
      typeof body.owner_discord_id !== 'string' ||
      !OWNER_ID_RE.test(body.owner_discord_id.trim())
    ) {
      return res.status(400).json({
        error: 'owner_discord_id doit etre un snowflake Discord valide',
        code: 'INVALID_OWNER_ID',
      });
    }
    ownerDiscordId = body.owner_discord_id.trim();
  }

  // 1) Deja linke ?
  const { data: existing, error: lookupErr } = await supabaseAdmin!
    .from('discord_guilds')
    .select(
      'guild_id, is_primary, tenant:tenants!discord_guilds_tenant_id_fkey(id, slug)'
    )
    .eq('guild_id', guildId)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[bot/tenants/link-guild] lookup error', lookupErr);
    return res.status(500).json({ error: 'Failed to check existing link' });
  }

  if (existing && existing.tenant) {
    const tenant = Array.isArray(existing.tenant)
      ? existing.tenant[0]
      : existing.tenant;
    return res.status(200).json({
      status: 'already_linked',
      guild_id: existing.guild_id,
      is_primary: existing.is_primary,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
    });
  }

  // 2) Inconnu : upsert dans pending_guild_links (idempotent par PK).
  // On rafraichit `requested_at` et `guild_name` a chaque appel pour que
  // l'admin voie la demande la plus recente.
  const upsertPayload = {
    guild_id: guildId,
    guild_name: guildName,
    owner_discord_id: ownerDiscordId,
    requested_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabaseAdmin!
    .from('pending_guild_links')
    .upsert(upsertPayload, { onConflict: 'guild_id' });

  if (upsertErr) {
    logger.error('[bot/tenants/link-guild] upsert error', upsertErr);
    return res.status(500).json({ error: 'Failed to record pending link' });
  }

  logger.info('[bot/tenants/link-guild] new pending guild link recorded', {
    guild_id: guildId,
    guild_name: guildName,
  });

  return res.status(200).json({
    status: 'pending_admin_link',
    guild_id: guildId,
    guild_name: guildName,
    owner_discord_id: ownerDiscordId,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-tenants-link-guild' },
  idempotent: true,
  crossTenant: true,
});
