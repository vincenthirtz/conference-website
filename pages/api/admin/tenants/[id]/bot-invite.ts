// pages/api/admin/tenants/[id]/bot-invite.ts
//
// GET : le lien d'invitation du bot POUR CET ESPACE.
//
// L'URL d'invitation était la même pour tout le monde. On l'ouvrait, on
// choisissait un serveur sur Discord, puis il fallait revenir, rafraîchir la
// file d'attente, reconnaître le bon serveur et le rattacher au bon espace :
// trois occasions de se tromper pour un geste qui se pense comme un seul.
//
// Ici le lien porte l'espace, signé. Quand la redirection est configurée
// (`DISCORD_OAUTH_REDIRECT_URI`, déclarée côté Discord), Discord renvoie
// l'installateur sur `/api/onboard/discord-callback` avec le serveur choisi :
// le rattachement se fait tout seul, sur le bon espace.
//
// La réponse dit TOUJOURS dans quel mode on est (`direct` / `manual`), parce
// que l'écran doit pouvoir promettre le bon comportement. Annoncer un
// rattachement automatique qui n'aura pas lieu est pire que de ne rien
// promettre.
//
// `?guildId=` pré-sélectionne un serveur : c'est le cas de la ré-invitation
// d'un serveur déjà rattaché (permissions perdues, bot expulsé).
//
// Portée : owner de la PLATEFORME, comme le rattachement lui-même.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import { buildTenantBotInvite } from '@/utils/tenants/botInvite';
import { GUILD_ID_RE } from '@/utils/tenants/attachGuild';

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
      'admin-tenant-bot-invite'
    )
  ) {
    return;
  }
  // Le lien porte un state signé, à durée de vie courte : jamais de cache.
  res.setHeader('Cache-Control', 'no-store');

  switch (req.method) {
    case 'GET':
      break;
    default:
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  const guildIdRaw =
    typeof req.query.guildId === 'string' ? req.query.guildId.trim() : '';
  const guildId = GUILD_ID_RE.test(guildIdRaw) ? guildIdRaw : null;

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('[admin/tenant-bot-invite] tenant load error', error);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!tenant) {
    return res
      .status(404)
      .json({ error: 'Tenant not found.', code: 'UNKNOWN_TENANT' });
  }

  const invite = buildTenantBotInvite({
    tenantId: id,
    staffId: ctx.staff.id,
    guildId,
  });

  return res.status(200).json({
    tenant,
    url: invite.url,
    mode: invite.mode,
    // Pré-sélection : l'écran doit pouvoir dire « ce serveur-là », pas
    // « un serveur ».
    guildId,
  });
}

export default withStaffRoute(handler, {
  permission: 'manage_tenant',
  scope: 'platform',
});
