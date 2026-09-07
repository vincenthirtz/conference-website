// pages/api/admin/tiktok/credentials.ts
//
// Pose la client key et le client secret de l'app TikTok, chiffrés, dans
// `integration_secrets`.
//
// POURQUOI DEPUIS L'ADMIN ET PAS UN SCRIPT LOCAL. La clé de chiffrement
// (`SECRETS_ENC_KEY`) ne vit qu'en production — c'est tout l'intérêt. Le
// chiffrement se fait donc là où la clé est déjà : côté serveur. Même
// mécanique que `../instagram/secret.ts`.
//
// LES DEUX ENSEMBLE, TOUJOURS. Une client key sans son secret ne sert à rien,
// et les remplacer séparément laisse une paire dépareillée dont le seul
// symptôme est un `invalid_client` au bout du parcours OAuth — un message qui
// ne dit pas lequel des deux est en cause.
//
// GET — dit SI les identifiants sont posés, jamais leur valeur.
// PUT — enregistre la paire (chiffrée). Elle n'est jamais relue ensuite.
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
import { loadAccount, tiktokRedirectUri } from '@/utils/social/tiktok';

export default withStaffRoute(handler, {
  permission: 'manage_communications',
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method === 'GET') {
    const [clientKeySet, clientSecretSet, account] = await Promise.all([
      hasIntegrationSecret(ctx.tenantId, 'tiktok_client_key'),
      hasIntegrationSecret(ctx.tenantId, 'tiktok_client_secret'),
      loadAccount(ctx.tenantId),
    ]);
    return res.status(200).json({
      clientKeySet,
      clientSecretSet,
      encryptionReady: isSecretEncryptionConfigured(),
      connected: account?.status === 'connected',
      handle: account?.handle ?? null,
      lastError: null,
      // Affichée dans le panneau : c'est l'URL à recopier À L'IDENTIQUE dans
      // l'app TikTok, et la recopier de mémoire est la première cause d'échec.
      redirectUri: tiktokRedirectUri(),
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

  const body = (req.body ?? {}) as {
    clientKey?: unknown;
    clientSecret?: unknown;
  };
  const clientKey =
    typeof body.clientKey === 'string' ? body.clientKey.trim() : '';
  const clientSecret =
    typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';

  // Contrôle de forme AVANT chiffrement. TikTok ne documente pas de longueur
  // fixe, donc on ne vérifie que ce qui est sûr : non vide, sans espace, et
  // pas un copier-coller qui a emporté l'étiquette du champ.
  const looksWrong = (value: string) => !value || /\s/.test(value);
  if (looksWrong(clientKey) || looksWrong(clientSecret)) {
    return res.status(400).json({
      error:
        'Client key et client secret sont requis, sans espace. ' +
        'Ils se lisent sur developers.tiktok.com › votre app › Credentials.',
    });
  }

  try {
    await setIntegrationSecret(
      ctx.tenantId,
      'tiktok_client_key',
      clientKey,
      ctx.staff?.id ?? null
    );
    await setIntegrationSecret(
      ctx.tenantId,
      'tiktok_client_secret',
      clientSecret,
      ctx.staff?.id ?? null
    );
  } catch (err) {
    logger.error('[admin/tiktok/credentials] enregistrement impossible', err);
    return res
      .status(500)
      .json({ error: 'Les identifiants n’ont pas pu être enregistrés.' });
  }

  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'store_social_credentials',
        entity_type: 'integration_secret',
        entity_id: 'tiktok_client_key',
        tenant_id: ctx.tenantId,
        // Aucune trace des valeurs, ni même de leur début : ce journal est
        // relisible par tout le staff.
        payload: { platform: 'tiktok' },
      });
    } catch (logErr) {
      logger.error('logStaffAction(store_social_credentials) error:', logErr);
    }
  }

  return res
    .status(200)
    .json({ ok: true, clientKeySet: true, clientSecretSet: true });
}
