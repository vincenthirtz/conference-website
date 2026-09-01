// pages/api/admin/tenants/[id]/discord-config/[guildId]/channels.ts
//
// Liste les salons + rôles d'un guild Discord pour alimenter le sélecteur de
// l'admin (au lieu de coller des snowflakes à la main). Le site n'a AUCUN accès
// Discord : on relaie la demande au bot (repo docker-box) qui, lui, a discord.js.
//
// Flux : UI admin → cette route (staff) → GET signé HMAC vers le bot
// (`BOT_WEBHOOK_URL` → .../guild-inventory) → bot renvoie { guild, channels, roles }.
// Auth vers le bot : même secret per-tenant que utils/botEvents.ts
// (tenant_secrets.bot_webhook_secret), signature sur `${guildId}:${timestamp}`.

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  hasAtLeastRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { canAccessTenant } from '@/utils/adminTenants';
import { logger } from '@/utils/logger';

const SNOWFLAKE_RE = /^[0-9]{15,25}$/;
const BOT_TIMEOUT_MS = 12_000;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-discord-guild-inventory'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, guildId } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tenant id.' });
  }
  if (!guildId || typeof guildId !== 'string' || !SNOWFLAKE_RE.test(guildId)) {
    return res.status(400).json({ error: 'Invalid guild id.' });
  }

  // Accès : manager+ (aligné sur la lecture de la config Discord). Casters
  // exclus ; pôle admins bénéficient du bypass cross-tenant.
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const isPoleAdmin =
    (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
  const allowed = await canAccessTenant(ctx.staff.id, id, { isPoleAdmin });
  if (!allowed) {
    return res.status(403).json({ error: 'No access to this tenant.' });
  }

  // Le guild doit appartenir au tenant : empêche d'introspecter un serveur
  // arbitraire via un guildId forgé.
  const { data: guildRow, error: gErr } = await supabaseAdmin
    .from('discord_guilds')
    .select('guild_id')
    .eq('tenant_id', id)
    .eq('guild_id', guildId)
    .maybeSingle();
  if (gErr) {
    logger.error('[discord-config/channels] guild lookup error', gErr);
    return res.status(500).json({ error: 'Lookup failed.' });
  }
  if (!guildRow) {
    return res.status(404).json({ error: 'Guild not linked to tenant.' });
  }

  const webhookUrl = process.env.BOT_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(503).json({ error: 'Bot webhook non configuré.' });
  }
  const { data: secretRow } = await supabaseAdmin
    .from('tenant_secrets')
    .select('bot_webhook_secret')
    .eq('tenant_id', id)
    .maybeSingle();
  const secret = (secretRow?.bot_webhook_secret as string | undefined) ?? null;
  if (!secret) {
    return res
      .status(503)
      .json({ error: 'Secret webhook bot manquant pour ce tenant.' });
  }

  // BOT_WEBHOOK_URL pointe le endpoint POST (.../bot/site-events) ; on résout
  // le endpoint inventaire relatif → .../bot/guild-inventory.
  let inventoryUrl: URL;
  try {
    inventoryUrl = new URL('guild-inventory', webhookUrl);
  } catch {
    return res.status(503).json({ error: 'BOT_WEBHOOK_URL invalide.' });
  }
  inventoryUrl.searchParams.set('guildId', guildId);

  const timestamp = new Date().toISOString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${guildId}:${timestamp}`)
    .digest('hex');

  try {
    const botRes = await fetch(inventoryUrl.toString(), {
      method: 'GET',
      headers: {
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': timestamp,
      },
      signal: AbortSignal.timeout(BOT_TIMEOUT_MS),
    });

    if (!botRes.ok) {
      logger.warn(
        `[discord-config/channels] bot responded ${botRes.status} for guild ${guildId}`
      );
      if (botRes.status === 404) {
        return res.status(404).json({
          error:
            'Serveur introuvable côté bot (le bot est-il présent sur ce Discord ?).',
        });
      }
      return res.status(502).json({ error: 'Erreur inventaire côté bot.' });
    }

    const json = (await botRes.json()) as unknown;
    return res.status(200).json(json);
  } catch (err) {
    logger.error('[discord-config/channels] bot fetch failed', err);
    return res.status(504).json({ error: 'Bot injoignable.' });
  }
}

export default withStaffRoute(handler, { permission: 'manage_settings' });
