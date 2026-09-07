// pages/api/admin/tiktok/authorize.ts
//
// Départ du consentement TikTok : redirige le staff vers l'écran
// d'autorisation, avec un `state` signé (CSRF + binding tenant, TTL 10 min).
//
// Le retour se fait sur ./callback.ts, dont l'URL doit être déclarée À
// L'IDENTIQUE dans les réglages de l'app TikTok — comparaison au caractère
// près, et refus muet sinon.
//
// Auth : session staff porteuse de `manage_communications`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  buildAuthorizeUrl,
  signState,
  tiktokCredentials,
} from '@/utils/social/tiktok';

export default withStaffRoute(handler, {
  permission: 'manage_communications',
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fonctionnalité dormante plutôt que plantage : sans identifiants d'app, le
  // miroir TikTok n'existe simplement pas encore.
  const creds = await tiktokCredentials(ctx.tenantId);
  if (!creds) {
    return res.status(503).json({
      error:
        'TikTok non configuré : client key ou client secret absents. ' +
        'Ils se posent depuis Communications › Réseaux, et se lisent sur ' +
        'developers.tiktok.com › votre app › Credentials.',
    });
  }

  return res.redirect(
    302,
    buildAuthorizeUrl(creds.clientKey, signState(ctx.tenantId))
  );
}
