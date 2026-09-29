// features/admin/social/service.ts — identifiants des apps Instagram (Meta) et
// TikTok, chiffrés dans `integration_secrets`.
//
// POURQUOI DEPUIS L'ADMIN ET PAS UN SCRIPT LOCAL. La clé de chiffrement
// (`SECRETS_ENC_KEY`) ne vit qu'en production : le chiffrement se fait là où
// la clé est déjà, côté serveur. Les secrets ne sont JAMAIS relus ni rendus :
// GET dit seulement s'ils sont posés.
//
// Le journal (`store_social_credentials`) ne porte aucune trace des valeurs,
// ni même de leur début : il est relisible par tout le staff.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError, ValidationError } from '@/utils/admin/errors';
import {
  hasIntegrationSecret,
  isSecretEncryptionConfigured,
  setIntegrationSecret,
} from '@/utils/integrationSecrets';
import { instagramAppId } from '@/utils/social/instagram';
import { loadAccount, tiktokRedirectUri } from '@/utils/social/tiktok';
import type { Audited } from '../_shared/audited';

function requireEncryption(): void {
  if (!isSecretEncryptionConfigured()) {
    throw new AdminError(
      503,
      'service_unavailable',
      'SECRETS_ENC_KEY absente de l’environnement : impossible de chiffrer.'
    );
  }
}

/* ---------------------------------------------------------------------------
 * Instagram — App Secret Meta
 * ------------------------------------------------------------------------ */

export async function instagramSecretState(ctx: ServiceContext) {
  return {
    appIdSet: Boolean(instagramAppId()),
    secretSet: await hasIntegrationSecret(ctx.tenantId, 'instagram_app_secret'),
    encryptionReady: isSecretEncryptionConfigured(),
  };
}

export async function storeInstagramSecret(
  ctx: ServiceContext,
  staffId: string,
  body: { appSecret?: unknown }
): Promise<Audited<{ ok: true; secretSet: true }>> {
  requireEncryption();
  const secret =
    typeof body.appSecret === 'string' ? body.appSecret.trim() : '';

  // Contrôle de forme AVANT chiffrement : une valeur mal collée n'échouerait
  // qu'au premier échange OAuth, avec un message de Meta qui ne dit pas que
  // le secret est en cause.
  if (!/^[a-f0-9]{32}$/i.test(secret)) {
    throw new ValidationError(
      'Ce n’est pas un App Secret Meta : 32 caractères hexadécimaux attendus.'
    );
  }

  try {
    await setIntegrationSecret(
      ctx.tenantId,
      'instagram_app_secret',
      secret,
      staffId
    );
  } catch (err) {
    ctx.logger.error('[admin/instagram/secret] enregistrement impossible', err);
    throw new AdminError(
      500,
      'internal',
      'Le secret n’a pas pu être enregistré.'
    );
  }

  return {
    result: { ok: true, secretSet: true },
    audit: {
      entity_type: 'integration_secret',
      entity_id: 'instagram_app_secret',
      payload: { platform: 'instagram' },
    },
  };
}

/* ---------------------------------------------------------------------------
 * TikTok — client key + client secret, TOUJOURS ensemble
 * ------------------------------------------------------------------------ */

export async function tiktokCredentialsState(ctx: ServiceContext) {
  const [clientKeySet, clientSecretSet, account] = await Promise.all([
    hasIntegrationSecret(ctx.tenantId, 'tiktok_client_key'),
    hasIntegrationSecret(ctx.tenantId, 'tiktok_client_secret'),
    loadAccount(ctx.tenantId),
  ]);
  return {
    clientKeySet,
    clientSecretSet,
    encryptionReady: isSecretEncryptionConfigured(),
    connected: account?.status === 'connected',
    handle: account?.handle ?? null,
    lastError: null,
    // L'URL à recopier À L'IDENTIQUE dans l'app TikTok.
    redirectUri: tiktokRedirectUri(),
  };
}

export async function storeTiktokCredentials(
  ctx: ServiceContext,
  staffId: string,
  body: { clientKey?: unknown; clientSecret?: unknown }
): Promise<Audited<{ ok: true; clientKeySet: true; clientSecretSet: true }>> {
  requireEncryption();
  const clientKey =
    typeof body.clientKey === 'string' ? body.clientKey.trim() : '';
  const clientSecret =
    typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';

  // TikTok ne documente pas de longueur fixe : non vide et sans espace.
  const looksWrong = (value: string) => !value || /\s/.test(value);
  if (looksWrong(clientKey) || looksWrong(clientSecret)) {
    throw new ValidationError(
      'Client key et client secret sont requis, sans espace. ' +
        'Ils se lisent sur developers.tiktok.com › votre app › Credentials.'
    );
  }

  try {
    await setIntegrationSecret(
      ctx.tenantId,
      'tiktok_client_key',
      clientKey,
      staffId
    );
    await setIntegrationSecret(
      ctx.tenantId,
      'tiktok_client_secret',
      clientSecret,
      staffId
    );
  } catch (err) {
    ctx.logger.error(
      '[admin/tiktok/credentials] enregistrement impossible',
      err
    );
    throw new AdminError(
      500,
      'internal',
      'Les identifiants n’ont pas pu être enregistrés.'
    );
  }

  return {
    result: { ok: true, clientKeySet: true, clientSecretSet: true },
    audit: {
      entity_type: 'integration_secret',
      entity_id: 'tiktok_client_key',
      payload: { platform: 'tiktok' },
    },
  };
}
