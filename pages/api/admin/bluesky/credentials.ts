// pages/api/admin/bluesky/credentials.ts
//
// Mise en service Bluesky : handle + mot de passe d'application.
//
// Pas d'OAuth ici, et ce n'est pas un raccourci — le protocole AT n'en propose
// pas pour ce cas. Un mot de passe d'application se revoque d'un clic depuis
// les reglages du compte, ce qui en fait l'equivalent fonctionnel d'un jeton.
//
// Comme pour Instagram, le chiffrement se fait COTE SERVEUR (`SECRETS_ENC_KEY`
// n'existe qu'en production) et la valeur n'est jamais relue par un client.
//
// GET — dit si le compte est configure, et sous quel handle. Jamais le mot de
//       passe.
// PUT — enregistre handle + mot de passe.
//
// Auth : session staff porteuse de `manage_communications`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  getIntegrationSecret,
  hasIntegrationSecret,
  isSecretEncryptionConfigured,
  setIntegrationSecret,
} from '@/utils/integrationSecrets';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { createSession } from '@/utils/social/bluesky';

export default withStaffRoute(handler, {
  permission: 'manage_communications',
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method === 'GET') return handleGet(req, res, ctx);
  if (req.method === 'PUT') return handlePut(req, res, ctx);
  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(
  _req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const [handle, hasPassword] = await Promise.all([
    getIntegrationSecret(ctx.tenantId, 'bluesky_handle'),
    hasIntegrationSecret(ctx.tenantId, 'bluesky_app_password'),
  ]);
  return res.status(200).json({
    configured: Boolean(handle && hasPassword),
    handle: handle ?? null,
    encryptionReady: isSecretEncryptionConfigured(),
  });
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

  const body = (req.body ?? {}) as { handle?: unknown; appPassword?: unknown };
  const handle =
    typeof body.handle === 'string'
      ? body.handle.trim().replace(/^@/, '')
      : '';
  const appPassword =
    typeof body.appPassword === 'string' ? body.appPassword.trim() : '';

  if (!handle || !handle.includes('.')) {
    return res.status(400).json({
      error:
        'Handle attendu sous la forme womenscup.bsky.social (sans le @ initial).',
    });
  }
  // Un mot de passe d'application Bluesky s'écrit xxxx-xxxx-xxxx-xxxx. Le
  // contrôle de forme évite le piège le plus courant : coller le mot de passe
  // DU COMPTE, qui fonctionnerait mais donnerait au site un accès total et
  // irrévocable sans changer le mot de passe principal.
  if (!/^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/i.test(appPassword)) {
    return res.status(400).json({
      error:
        'Ce n’est pas un mot de passe d’application (format xxxx-xxxx-xxxx-xxxx). ' +
        'N’utilisez PAS le mot de passe du compte : créez-en un dans Réglages › ' +
        'Confidentialité et sécurité › Mots de passe d’application.',
    });
  }

  // On vérifie que le couple fonctionne AVANT de l'enregistrer : un identifiant
  // faux stocké ne se manifesterait qu'à la première publication, au milieu
  // d'un envoi multi-cibles.
  try {
    await createSession(handle, appPassword);
  } catch (err) {
    return res.status(400).json({
      error: `Bluesky refuse ces identifiants : ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

  try {
    await setIntegrationSecret(
      ctx.tenantId,
      'bluesky_handle',
      handle,
      ctx.staff?.id ?? null
    );
    await setIntegrationSecret(
      ctx.tenantId,
      'bluesky_app_password',
      appPassword,
      ctx.staff?.id ?? null
    );
  } catch (err) {
    logger.error('[admin/bluesky] enregistrement impossible', err);
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
        entity_id: 'bluesky_app_password',
        tenant_id: ctx.tenantId,
        payload: { platform: 'bluesky', handle },
      });
    } catch (logErr) {
      logger.error('logStaffAction(store_social_credentials) error:', logErr);
    }
  }

  return res.status(200).json({ ok: true, configured: true, handle });
}
