// pages/api/onboard/discord-callback.ts
//
// Retour de Discord après l'installation du bot, quand le lien portait
// l'espace (cf. `utils/tenants/botInvite.ts`).
//
// Discord renvoie ici avec `?guild_id=…&state=…`. Le `state` est celui qu'on a
// signé en fabriquant le lien : il porte l'espace visé et la personne qui a
// demandé le lien. On peut donc rattacher tout de suite, sur le bon espace,
// sans que personne n'ait à revenir rafraîchir une file d'attente et
// reconnaître un serveur parmi d'autres.
//
// Ce n'est PAS une route ouverte : sans un state valide et non expiré, elle ne
// fait rien. Le state signé est la seule preuve que ce retour vient bien d'un
// lien que nous avons émis — sinon n'importe qui pourrait rattacher un serveur
// à l'espace de son choix en appelant cette URL à la main.
//
// Elle répond par une REDIRECTION vers la fiche de l'espace, avec un drapeau
// lisible : c'est un retour de navigateur, pas un appel d'API. Un JSON brut au
// visage de quelqu'un qui vient de cliquer « Autoriser » serait un cul-de-sac.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { logStaffAction } from '@/utils/staffLogs';
import { verifyInviteState } from '@/utils/tenants/botInvite';
import { attachGuildToTenant, GUILD_ID_RE } from '@/utils/tenants/attachGuild';

/** Where the operator lands, whatever happens. */
function back(
  res: NextApiResponse,
  tenantId: string | null,
  status: string,
  extra: Record<string, string> = {}
) {
  const params = new URLSearchParams({ botInvite: status, ...extra });
  const target = tenantId
    ? `/admin/tenants/${tenantId}?${params.toString()}`
    : `/admin/onboarding?tab=espaces&${params.toString()}`;
  res.setHeader('Location', target);
  return res.status(302).end();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'discord-callback')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  switch (req.method) {
    case 'GET':
      break;
    default:
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
  }

  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const payload = verifyInviteState(state);
  if (!payload) {
    // State absent, altéré ou périmé (30 min). On ne dit pas lequel : la
    // distinction n'aiderait qu'à forger.
    logger.warn('[onboard/discord-callback] invalid state');
    return back(res, null, 'invalid_state');
  }

  const guildId =
    typeof req.query.guild_id === 'string' ? req.query.guild_id.trim() : '';
  if (!GUILD_ID_RE.test(guildId)) {
    // Discord renvoie sans `guild_id` quand l'utilisateur annule l'écran
    // d'autorisation : ce n'est pas une erreur, c'est un renoncement.
    return back(res, payload.tenantId, 'cancelled');
  }

  const result = await attachGuildToTenant(payload.tenantId, guildId);

  if (!result.ok) {
    logger.warn('[onboard/discord-callback] attach refused', {
      code: result.code,
      tenantId: payload.tenantId,
    });
    return back(res, payload.tenantId, 'failed', { reason: result.code });
  }

  try {
    await logStaffAction({
      staff_id: payload.staffId,
      action: 'claim_guild_link',
      entity_type: 'tenant',
      entity_id: payload.tenantId,
      tenant_id: payload.tenantId,
      payload: {
        guildId: result.guildId,
        tenantSlug: result.tenant.slug,
        isPrimary: result.isPrimary,
        // D'où vient ce rattachement : le lien direct, pas un clic dans la
        // file d'attente. La distinction compte quand on relit le journal.
        from: 'bot_invite_callback',
      },
    });
  } catch (logErr) {
    logger.error('logStaffAction(claim_guild_link) error:', logErr);
  }

  // `already_linked` n'est pas un échec : réinstaller le bot sur un serveur
  // déjà rattaché est un geste normal (permissions perdues, bot expulsé).
  return back(
    res,
    payload.tenantId,
    result.status === 'already_linked' ? 'already_linked' : 'linked'
  );
}
