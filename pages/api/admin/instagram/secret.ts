// pages/api/admin/instagram/secret.ts
//
// Pose l'App Secret de l'app Meta, chiffre, dans `integration_secrets`.
//
// POURQUOI DEPUIS L'ADMIN ET PAS UN SCRIPT LOCAL. La cle de chiffrement
// (`SECRETS_ENC_KEY`) ne vit qu'en production — c'est tout l'interet. Un script
// local devrait donc soit la recopier sur un portable, soit aller la lire chez
// l'hebergeur ; le premier est un pas en arriere, le second demande un token
// Netlify de niveau compte qu'on n'a pas. Ici, le chiffrement se fait la ou la
// cle est deja : cote serveur. Meme mecanique que la cle Google Drive
// (`pages/api/admin/documents.ts`), qui a resolu exactement ce probleme.
//
// GET  — dit SI le secret est pose, jamais sa valeur.
// PUT  — enregistre le secret (chiffre). Le secret n'est jamais relu ensuite.
//
// Auth : session staff porteuse de `manage_communications`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  hasIntegrationSecret,
  isSecretEncryptionConfigured,
  setIntegrationSecret,
} from '@/utils/integrationSecrets';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { instagramAppId } from '@/utils/social/instagram';

export default withStaffRoute(handler, {
  permission: 'manage_communications',
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method === 'GET') {
    return res.status(200).json({
      appIdSet: Boolean(instagramAppId()),
      secretSet: await hasIntegrationSecret(
        ctx.tenantId,
        'instagram_app_secret'
      ),
      encryptionReady: isSecretEncryptionConfigured(),
    });
  }

  if (req.method === 'PUT') return handlePut(req, res, ctx);

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!isSecretEncryptionConfigured()) {
    return res.status(503).json({
      error:
        'SECRETS_ENC_KEY absente de l’environnement : impossible de chiffrer.',
    });
  }

  const body = (req.body ?? {}) as { appSecret?: unknown };
  const secret =
    typeof body.appSecret === 'string' ? body.appSecret.trim() : '';

  // Contrôle de forme AVANT chiffrement : une valeur mal collée serait
  // acceptée, chiffrée, et n'échouerait qu'au premier échange OAuth, avec un
  // message de Meta qui ne dit pas que le secret est en cause.
  if (!/^[a-f0-9]{32}$/i.test(secret)) {
    return res.status(400).json({
      error:
        'Ce n’est pas un App Secret Meta : 32 caractères hexadécimaux attendus.',
    });
  }

  try {
    await setIntegrationSecret(
      ctx.tenantId,
      'instagram_app_secret',
      secret,
      ctx.staff?.id ?? null
    );
  } catch (err) {
    logger.error('[admin/instagram/secret] enregistrement impossible', err);
    return res.status(500).json({ error: 'Le secret n’a pas pu être enregistré.' });
  }

  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'store_social_credentials',
        entity_type: 'integration_secret',
        entity_id: 'instagram_app_secret',
        tenant_id: ctx.tenantId,
        // Aucune trace de la valeur, ni meme de son debut : ce journal est
        // relisible par tout le staff.
        payload: { platform: 'instagram' },
      });
    } catch (logErr) {
      logger.error('logStaffAction(store_social_credentials) error:', logErr);
    }
  }

  return res.status(200).json({ ok: true, secretSet: true });
}
