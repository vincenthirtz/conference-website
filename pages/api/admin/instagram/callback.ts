// pages/api/admin/instagram/callback.ts
//
// Retour du consentement Instagram. Echange le code contre un jeton longue
// duree (60 j), lit l'identite du compte, et persiste le tout CHIFFRE dans
// `social_accounts`.
//
// Cette URL doit etre declaree telle quelle dans les reglages de l'app Meta :
//   https://owwomenscup.fr/api/admin/instagram/callback
//
// Auth : session staff porteuse de `manage_communications`. Meta redirige le
// navigateur du staff, donc la session est bien celle de la personne qui a
// lance l'autorisation — le `state` signe verifie en plus qu'on est au bout du
// parcours qu'ON a ouvert, pour ce tenant-la.
//
// La reponse est une REDIRECTION vers le panneau, avec le resultat en query :
// on arrive ici depuis un navigateur, pas depuis un fetch. Renvoyer du JSON
// laisserait l'utilisateur sur une page blanche.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  exchangeCode,
  isInstagramConfigured,
  saveConnection,
  verifyState,
} from '@/utils/social/instagram';

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
  if (!isInstagramConfigured()) {
    return back(res, { instagram: 'error', reason: 'not_configured' });
  }

  // Refus de l'utilisateur sur l'ecran Meta : ce n'est pas une panne, on
  // revient sans bruit.
  if (typeof req.query.error === 'string') {
    return back(res, { instagram: 'cancelled' });
  }

  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  if (!code || !state) {
    return back(res, { instagram: 'error', reason: 'missing_code' });
  }

  const payload = verifyState(state);
  if (!payload || payload.tenantId !== ctx.tenantId) {
    // Signature invalide, state perime, ou tenant qui ne correspond pas a la
    // session : dans les trois cas on ne persiste rien.
    return back(res, { instagram: 'error', reason: 'bad_state' });
  }

  try {
    const conn = await exchangeCode(ctx.tenantId, code);
    if (!conn.userId) {
      return back(res, { instagram: 'error', reason: 'no_account' });
    }
    await saveConnection(ctx.tenantId, conn, ctx.staff?.id ?? null);

    if (ctx.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'connect_social_account',
          entity_type: 'social_account',
          entity_id: conn.userId,
          tenant_id: ctx.tenantId,
          payload: { platform: 'instagram', handle: conn.username },
        });
      } catch (logErr) {
        logger.error('logStaffAction(connect_social_account) error:', logErr);
      }
    }

    return back(res, {
      instagram: 'connected',
      handle: conn.username ?? '',
    });
  } catch (err) {
    logger.error('[admin/instagram/callback] échec', err);
    return back(res, { instagram: 'error', reason: 'exchange_failed' });
  }
}
