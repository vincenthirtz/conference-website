// features/admin/social/service/bluesky.ts — mise en service Bluesky : handle
// + mot de passe d'application (le protocole AT n'offre pas d'OAuth pour ce
// cas ; un mot de passe d'application se révoque d'un clic).
//
// Chiffrement CÔTÉ SERVEUR (`SECRETS_ENC_KEY`) ; la valeur n'est jamais
// relue par un client.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import {
  getIntegrationSecret,
  hasIntegrationSecret,
  isSecretEncryptionConfigured,
  setIntegrationSecret,
} from '@/utils/integrationSecrets';
import { createSession } from '@/utils/social/bluesky';
import type { Audited } from '../../_shared/audited';

export async function getBlueskyAccount(ctx: ServiceContext) {
  const [handle, hasPassword] = await Promise.all([
    getIntegrationSecret(ctx.tenantId, 'bluesky_handle'),
    hasIntegrationSecret(ctx.tenantId, 'bluesky_app_password'),
  ]);
  return {
    configured: Boolean(handle && hasPassword),
    handle: handle ?? null,
    encryptionReady: isSecretEncryptionConfigured(),
  };
}

export async function storeBlueskyCredentials(
  ctx: ServiceContext,
  body: Record<string, unknown>,
  staffId: string | null
): Promise<Audited<{ ok: true; configured: true; handle: string }>> {
  if (!isSecretEncryptionConfigured()) {
    throw new LegacyAdminError(
      503,
      'SECRETS_ENC_KEY absente de l’environnement : impossible de chiffrer.'
    );
  }

  const handle =
    typeof body.handle === 'string' ? body.handle.trim().replace(/^@/, '') : '';
  const appPassword =
    typeof body.appPassword === 'string' ? body.appPassword.trim() : '';

  if (!handle || !handle.includes('.')) {
    throw new LegacyAdminError(
      400,
      'Handle attendu sous la forme womenscup.bsky.social (sans le @ initial).'
    );
  }
  // Forme xxxx-xxxx-xxxx-xxxx : évite de coller le mot de passe DU COMPTE,
  // qui donnerait au site un accès total et irrévocable.
  if (!/^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/i.test(appPassword)) {
    throw new LegacyAdminError(
      400,
      'Ce n’est pas un mot de passe d’application (format xxxx-xxxx-xxxx-xxxx). ' +
        'N’utilisez PAS le mot de passe du compte : créez-en un dans Réglages › ' +
        'Confidentialité et sécurité › Mots de passe d’application.'
    );
  }

  // Le couple doit fonctionner AVANT d'être enregistré : un identifiant faux
  // ne se manifesterait qu'en pleine publication multi-cibles.
  try {
    await createSession(handle, appPassword);
  } catch (err) {
    throw new LegacyAdminError(
      400,
      `Bluesky refuse ces identifiants : ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  try {
    await setIntegrationSecret(ctx.tenantId, 'bluesky_handle', handle, staffId);
    await setIntegrationSecret(
      ctx.tenantId,
      'bluesky_app_password',
      appPassword,
      staffId
    );
  } catch (err) {
    ctx.logger.error('[admin/bluesky] enregistrement impossible', err);
    throw new LegacyAdminError(
      500,
      'Les identifiants n’ont pas pu être enregistrés.'
    );
  }

  return {
    result: { ok: true, configured: true, handle },
    audit: {
      entity_type: 'integration_secret',
      entity_id: 'bluesky_app_password',
      payload: { platform: 'bluesky', handle },
    },
  };
}
