// pages/api/admin/instagram/authorize.ts
//
// Départ du consentement Instagram : redirige le staff vers l'écran
// d'autorisation Meta, avec un `state` signé (CSRF + binding tenant, TTL 10 min).
//
// Le retour se fait sur ./callback.ts, dont l'URL doit etre declaree A
// L'IDENTIQUE dans les reglages de l'app Meta — Meta compare au caractere pres
// et refuse sinon, sans expliquer pourquoi.
//
// Auth : session staff porteuse de `manage_communications`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  buildAuthorizeUrl,
  isInstagramConfigured,
  signState,
} from '@/utils/social/instagram';

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

  // Fonctionnalité dormante plutôt que plantage : sans App ID, la cible
  // Instagram n'existe simplement pas encore.
  if (!isInstagramConfigured()) {
    return res.status(503).json({
      error:
        'Instagram non configuré : INSTAGRAM_APP_ID absent de l’environnement.',
    });
  }

  return res.redirect(302, buildAuthorizeUrl(signState(ctx.tenantId)));
}
