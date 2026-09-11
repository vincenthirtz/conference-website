// pages/api/admin/tiktok/callback.ts
//
// Retour du consentement TikTok. Échange le code contre un couple de jetons
// (accès 24 h, rafraîchissement 365 j), lit le nom du compte, et persiste le
// tout CHIFFRÉ dans `social_accounts`.
//
// Cette URL doit être déclarée telle quelle dans les réglages de l'app TikTok :
//   https://owwomenscup.fr/api/admin/tiktok/callback
//
// Auth : session staff porteuse de `manage_communications`. TikTok redirige le
// navigateur du staff, donc la session est bien celle de la personne qui a
// lancé l'autorisation — le `state` signé vérifie en plus qu'on est au bout du
// parcours qu'ON a ouvert, pour ce tenant-là.
//
// La réponse est une REDIRECTION vers le panneau, avec le résultat en query :
// on arrive ici depuis un navigateur, pas depuis un fetch. Renvoyer du JSON
// laisserait l'utilisateur sur une page blanche.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  exchangeCode,
  fetchDisplayName,
  markError,
  saveConnection,
  tiktokCredentials,
  verifyState,
} from '@/utils/social/tiktok';

const PANEL = '/admin/communications?tab=social';

export default withStaffRoute(handler, {
  permission: 'manage_communications',
});

function back(res: NextApiResponse, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return res.redirect(302, `${PANEL}&${qs}`);
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const creds = await tiktokCredentials(ctx.tenantId);
  if (!creds) {
    return back(res, { tiktok: 'error', reason: 'not_configured' });
  }

  // Refus de l'utilisateur sur l'écran TikTok : ce n'est pas une panne, on
  // revient sans bruit.
  if (typeof req.query.error === 'string') {
    return back(res, { tiktok: 'cancelled' });
  }

  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  if (!code || !state) {
    return back(res, { tiktok: 'error', reason: 'missing_code' });
  }

  const payload = verifyState(state);
  if (!payload || payload.tenantId !== ctx.tenantId) {
    // Signature invalide, state périmé, ou tenant qui ne correspond pas à la
    // session : dans les trois cas on ne persiste rien.
    return back(res, { tiktok: 'error', reason: 'bad_state' });
  }

  try {
    const tokens = await exchangeCode(creds, code);
    // Le nom est un confort ; son absence ne doit pas faire échouer une
    // connexion par ailleurs valide.
    const displayName = await fetchDisplayName(tokens.accessToken);
    await saveConnection(
      ctx.tenantId,
      tokens,
      displayName,
      ctx.staff?.id ?? null
    );

    if (ctx.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'connect_social_account',
          entity_type: 'social_account',
          entity_id: tokens.openId || 'tiktok',
          tenant_id: ctx.tenantId,
          payload: { platform: 'tiktok', handle: displayName },
        });
      } catch (logErr) {
        logger.error('logStaffAction(connect_social_account) error:', logErr);
      }
    }

    return back(res, { tiktok: 'connected', handle: displayName ?? '' });
  } catch (err) {
    logger.error('[admin/tiktok/callback] échec', err);
    // Même règle qu'Instagram : le motif est consigné sur le compte, où le
    // panneau l'affiche, plutôt que de ne vivre que dans les logs Netlify.
    const message = err instanceof Error ? err.message : String(err);
    await markError(
      ctx.tenantId,
      `Connexion TikTok — ${message}`.slice(0, 500)
    ).catch(() => undefined);
    return back(res, { tiktok: 'error', reason: 'exchange_failed' });
  }
}
