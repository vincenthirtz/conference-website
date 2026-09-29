// features/admin/tenants/service/helloasso.ts — COMPTE D'ENCAISSEMENT de
// l'espace : identifiants API HelloAsso de son association et URL de
// notification à coller chez elle (correctif Q036).
//
// L'espace historique (la Coupe) encaisse sur le compte de l'association,
// configuré en variables d'environnement : `PLATFORM_ACCOUNT`.
// Le secret n'est JAMAIS relu par un client — même modèle que Brevo.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import {
  deleteIntegrationSecret,
  getIntegrationSecret,
  hasIntegrationSecret,
  isSecretEncryptionConfigured,
  setIntegrationSecret,
} from '@/utils/integrationSecrets';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { helloAssoNotificationUrl } from '@/utils/billing/helloassoAccount';
import { verifyHelloAssoCredentials } from '@/utils/helloasso';
import { helloassoUnlinkClearsGrant } from '@/utils/billing/nonprofitGrant';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/helloasso';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/;

const PLATFORM_ACCOUNT_ERROR = () =>
  new LegacyAdminError(
    400,
    'Cet espace encaisse sur le compte de l’association (variables d’environnement).',
    { code: 'PLATFORM_ACCOUNT' }
  );

async function tenantSlug(ctx: ServiceContext): Promise<string | null> {
  const { slug, error } = await repo.readTenantSlug(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/helloasso] slug illisible: %s', error.message);
    return null;
  }
  return slug;
}

function notificationUrl(ctx: ServiceContext, slug: string | null) {
  return slug
    ? helloAssoNotificationUrl(absoluteSiteUrl('/'), slug, ctx.tenantId)
    : null;
}

/**
 * Pose (ou renouvelle) l'estampille « association vérifiée ». Ne lève jamais :
 * un espace qui relie son compte doit pouvoir encaisser même si la remise
 * commerciale n'a pas pu être enregistrée.
 */
async function stampNonprofitVerification(
  ctx: ServiceContext,
  organizationName: string | null
): Promise<void> {
  const { error } = await repo.writeNonprofitStamp(ctx.db, ctx.tenantId, {
    nonprofit_verified_at: new Date().toISOString(),
    nonprofit_org_name: organizationName ?? null,
    nonprofit_verified_via: 'helloasso',
  });
  if (error) {
    ctx.logger.error(
      '[admin/helloasso] estampille association: %s',
      error.message
    );
  }
}

/**
 * Retire l'estampille quand le compte est délié — SI elle venait de là : une
 * association vérifiée par son RNA ne perd aucune preuve en déliant son
 * compte d'encaissement.
 */
async function clearNonprofitVerification(ctx: ServiceContext): Promise<void> {
  const via = await repo.readNonprofitProvenance(ctx.db, ctx.tenantId);
  if (!helloassoUnlinkClearsGrant(via)) {
    ctx.logger.info(
      '[admin/helloasso] estampille conservée (provenance %s) tenant=%s',
      via,
      ctx.tenantId
    );
    return;
  }
  const { error } = await repo.writeNonprofitStamp(ctx.db, ctx.tenantId, {
    nonprofit_verified_at: null,
    nonprofit_org_name: null,
    nonprofit_verified_via: null,
  });
  if (error) {
    ctx.logger.error('[admin/helloasso] retrait estampille: %s', error.message);
  }
}

export async function getHelloAssoAccount(ctx: ServiceContext) {
  if (ctx.tenantId === DEFAULT_TENANT_ID) {
    return {
      usesPlatformAccount: true,
      connected: Boolean(process.env.HELLOASSO_ORG_SLUG),
      organizationSlug: process.env.HELLOASSO_ORG_SLUG ?? null,
      notificationUrl: null,
      encryptionReady: isSecretEncryptionConfigured(),
    };
  }

  const [hasClientId, hasSecret, orgSlug, slug] = await Promise.all([
    hasIntegrationSecret(ctx.tenantId, 'helloasso_client_id'),
    hasIntegrationSecret(ctx.tenantId, 'helloasso_client_secret'),
    getIntegrationSecret(ctx.tenantId, 'helloasso_org_slug'),
    tenantSlug(ctx),
  ]);

  return {
    usesPlatformAccount: false,
    connected: Boolean(hasClientId && hasSecret && orgSlug),
    organizationSlug: orgSlug,
    // Rendue MÊME non reliée : l'association la prépare souvent avant.
    notificationUrl: notificationUrl(ctx, slug),
    encryptionReady: isSecretEncryptionConfigured(),
  };
}

export async function linkHelloAssoAccount(
  ctx: ServiceContext,
  body: Record<string, unknown>,
  staffId: string | null
) {
  if (ctx.tenantId === DEFAULT_TENANT_ID) throw PLATFORM_ACCOUNT_ERROR();
  if (!isSecretEncryptionConfigured()) {
    throw new LegacyAdminError(
      503,
      'SECRETS_ENC_KEY absente de l’environnement : impossible de chiffrer.'
    );
  }

  const clientId =
    typeof body.clientId === 'string' ? body.clientId.trim() : '';
  const clientSecret =
    typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';
  const organizationSlug =
    typeof body.organizationSlug === 'string'
      ? body.organizationSlug.trim().toLowerCase()
      : '';

  if (!clientId || !clientSecret) {
    throw new LegacyAdminError(
      400,
      'Identifiant et clé secrète HelloAsso requis.'
    );
  }
  if (!SLUG_RE.test(organizationSlug)) {
    throw new LegacyAdminError(
      400,
      'Slug d’organisation invalide : il se lit dans l’adresse de votre page HelloAsso.'
    );
  }

  const check = await verifyHelloAssoCredentials({
    clientId,
    clientSecret,
    orgSlug: organizationSlug,
  });
  if (!check.ok) {
    throw new LegacyAdminError(400, check.error, { code: check.code });
  }

  try {
    await setIntegrationSecret(
      ctx.tenantId,
      'helloasso_client_id',
      clientId,
      staffId
    );
    await setIntegrationSecret(
      ctx.tenantId,
      'helloasso_client_secret',
      clientSecret,
      staffId
    );
    await setIntegrationSecret(
      ctx.tenantId,
      'helloasso_org_slug',
      organizationSlug,
      staffId
    );
  } catch (err) {
    ctx.logger.error('[admin/helloasso] enregistrement impossible', err);
    throw new LegacyAdminError(
      500,
      'Les identifiants n’ont pas pu être enregistrés.'
    );
  }

  // L'appel HelloAsso qui vient de réussir EST la vérification « association »
  // (HelloAsso n'ouvre de compte qu'à des organismes à but non lucratif).
  await stampNonprofitVerification(ctx, check.organizationName);

  const slug = await tenantSlug(ctx);
  return {
    result: {
      connected: true,
      organizationSlug,
      organizationName: check.organizationName,
      notificationUrl: notificationUrl(ctx, slug),
    },
    audit: {
      entity_type: 'integration_secret',
      entity_id: 'helloasso_client_id',
      payload: {
        organizationSlug,
        organizationName: check.organizationName,
        nonprofitVerified: true,
      },
    },
  };
}

export async function unlinkHelloAssoAccount(
  ctx: ServiceContext
): Promise<Audited<{ connected: false }>> {
  if (ctx.tenantId === DEFAULT_TENANT_ID) throw PLATFORM_ACCOUNT_ERROR();
  try {
    await deleteIntegrationSecret(ctx.tenantId, 'helloasso_client_id');
    await deleteIntegrationSecret(ctx.tenantId, 'helloasso_client_secret');
    await deleteIntegrationSecret(ctx.tenantId, 'helloasso_org_slug');
  } catch (err) {
    ctx.logger.error('[admin/helloasso] suppression impossible', err);
    throw new LegacyAdminError(500, 'Le compte n’a pas pu être délié.');
  }

  await clearNonprofitVerification(ctx);

  return {
    result: { connected: false },
    audit: {
      entity_type: 'integration_secret',
      entity_id: 'helloasso_client_id',
      payload: { removed: true, nonprofitVerified: false },
    },
  };
}
