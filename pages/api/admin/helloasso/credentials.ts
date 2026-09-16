// pages/api/admin/helloasso/credentials.ts
//
// COMPTE D'ENCAISSEMENT DE L'ESPACE : les identifiants API HelloAsso de son
// association, et l'URL de notification à coller chez elle.
//
// Pourquoi chaque espace apporte le sien (correctif Q036, 2026-09-16).
// Encaisser une cagnotte, c'est recevoir l'argent d'autrui : jusqu'ici, toutes
// les contributions arrivaient sur le compte de la OW Women's Cup, sans aucun
// moyen de les reverser. Un espace tiers relie donc SON compte — obtenu dans
// son back-office HelloAsso (« Mon compte › Intégrations et API », privilège
// `Checkout`) — et l'argent de ses tournois arrive chez lui. Sans compte relié,
// il ne peut pas ouvrir de cagnotte : le refus est explicite.
//
// L'espace historique (la Coupe) encaisse sur le compte de l'association,
// configuré en variables d'environnement : il n'a rien à relier ici.
//
// GET    — dit si l'encaissement est relié, sur quelle organisation, et rend
//          l'URL de notification (jeton dérivé, jamais stocké).
// PUT    — enregistre les identifiants APRÈS les avoir vérifiés auprès de
//          HelloAsso : une clé fausse ne se manifesterait qu'au premier
//          paiement, c'est-à-dire devant une contributrice.
// DELETE — délie le compte (les cagnottes de l'espace cessent d'encaisser).
//
// Auth : session staff porteuse de `manage_settings`, scopée au tenant actif.
// Le secret n'est JAMAIS relu par un client — même modèle que Brevo.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  deleteIntegrationSecret,
  getIntegrationSecret,
  hasIntegrationSecret,
  isSecretEncryptionConfigured,
  setIntegrationSecret,
} from '@/utils/integrationSecrets';
import { supabaseAdmin } from '@/utils/supabase';
import { logStaffAction } from '@/utils/staffLogs';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { helloAssoNotificationUrl } from '@/utils/billing/helloassoAccount';
import { verifyHelloAssoCredentials } from '@/utils/helloasso';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/;

export default withStaffRoute(handler, { permission: 'manage_settings' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'admin-helloasso-creds'
    )
  ) {
    return;
  }
  if (req.method === 'GET') return handleGet(res, ctx);
  if (req.method === 'PUT') return handlePut(req, res, ctx);
  if (req.method === 'DELETE') return handleDelete(res, ctx);
  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

/** Le slug de l'espace, pour composer l'URL de notification. */
async function readTenantSlug(tenantId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    logger.error('[admin/helloasso] slug illisible: %s', error.message);
    return null;
  }
  return (data as { slug?: string } | null)?.slug ?? null;
}

/**
 * Pose (ou renouvelle) l'estampille « association vérifiée ».
 *
 * Ne lève jamais et ne bloque rien : la colonne peut ne pas exister encore
 * (migration non appliquée), et un espace qui relie son compte doit pouvoir
 * encaisser même si la remise commerciale n'a pas pu être enregistrée.
 */
async function stampNonprofitVerification(
  tenantId: string,
  organizationName: string | null
): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      nonprofit_verified_at: new Date().toISOString(),
      nonprofit_org_name: organizationName ?? null,
    })
    .eq('id', tenantId);
  if (error) {
    logger.error('[admin/helloasso] estampille association: %s', error.message);
  }
}

/**
 * Retire l'estampille quand le compte est délié.
 *
 * La preuve disparaît avec le compte qui la portait : garder la gratuité après
 * la déliaison, ce serait offrir un palier sur la foi d'un compte qu'on ne peut
 * plus interroger.
 */
async function clearNonprofitVerification(tenantId: string): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ nonprofit_verified_at: null, nonprofit_org_name: null })
    .eq('id', tenantId);
  if (error) {
    logger.error('[admin/helloasso] retrait estampille: %s', error.message);
  }
}

async function handleGet(res: NextApiResponse, ctx: AuthenticatedStaffContext) {
  if (ctx.tenantId === DEFAULT_TENANT_ID) {
    return res.status(200).json({
      usesPlatformAccount: true,
      connected: Boolean(process.env.HELLOASSO_ORG_SLUG),
      organizationSlug: process.env.HELLOASSO_ORG_SLUG ?? null,
      notificationUrl: null,
      encryptionReady: isSecretEncryptionConfigured(),
    });
  }

  const [hasClientId, hasSecret, orgSlug, tenantSlug] = await Promise.all([
    hasIntegrationSecret(ctx.tenantId, 'helloasso_client_id'),
    hasIntegrationSecret(ctx.tenantId, 'helloasso_client_secret'),
    getIntegrationSecret(ctx.tenantId, 'helloasso_org_slug'),
    readTenantSlug(ctx.tenantId),
  ]);

  return res.status(200).json({
    usesPlatformAccount: false,
    connected: Boolean(hasClientId && hasSecret && orgSlug),
    organizationSlug: orgSlug,
    // Rendue MÊME non reliée : c'est l'URL que l'association doit coller dans
    // son back-office, et elle la prépare souvent avant de revenir ici.
    notificationUrl: tenantSlug
      ? helloAssoNotificationUrl(absoluteSiteUrl('/'), tenantSlug, ctx.tenantId)
      : null,
    encryptionReady: isSecretEncryptionConfigured(),
  });
}

async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (ctx.tenantId === DEFAULT_TENANT_ID) {
    return res.status(400).json({
      error:
        'Cet espace encaisse sur le compte de l’association (variables d’environnement).',
      code: 'PLATFORM_ACCOUNT',
    });
  }
  if (!isSecretEncryptionConfigured()) {
    return res.status(503).json({
      error:
        'SECRETS_ENC_KEY absente de l’environnement : impossible de chiffrer.',
    });
  }

  const body = (req.body ?? {}) as {
    clientId?: unknown;
    clientSecret?: unknown;
    organizationSlug?: unknown;
  };
  const clientId =
    typeof body.clientId === 'string' ? body.clientId.trim() : '';
  const clientSecret =
    typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';
  const organizationSlug =
    typeof body.organizationSlug === 'string'
      ? body.organizationSlug.trim().toLowerCase()
      : '';

  if (!clientId || !clientSecret) {
    return res
      .status(400)
      .json({ error: 'Identifiant et clé secrète HelloAsso requis.' });
  }
  if (!SLUG_RE.test(organizationSlug)) {
    return res.status(400).json({
      error:
        'Slug d’organisation invalide : il se lit dans l’adresse de votre page HelloAsso.',
    });
  }

  const check = await verifyHelloAssoCredentials({
    clientId,
    clientSecret,
    orgSlug: organizationSlug,
  });
  if (!check.ok) {
    return res.status(400).json({ error: check.error, code: check.code });
  }

  try {
    await setIntegrationSecret(
      ctx.tenantId,
      'helloasso_client_id',
      clientId,
      ctx.staff?.id ?? null
    );
    await setIntegrationSecret(
      ctx.tenantId,
      'helloasso_client_secret',
      clientSecret,
      ctx.staff?.id ?? null
    );
    await setIntegrationSecret(
      ctx.tenantId,
      'helloasso_org_slug',
      organizationSlug,
      ctx.staff?.id ?? null
    );
  } catch (err) {
    logger.error('[admin/helloasso] enregistrement impossible', err);
    return res
      .status(500)
      .json({ error: 'Les identifiants n’ont pas pu être enregistrés.' });
  }

  // L'appel HelloAsso qui vient de réussir EST la vérification « association » :
  // HelloAsso n'ouvre de compte qu'à des organismes à but non lucratif. On
  // l'estampille ici, et la Découverte cesse d'être facturée pour cet espace
  // (cf. utils/billing/nonprofitGrant.ts). Best-effort : un espace dont
  // l'estampille échoue garde son compte relié — il serait absurde de refuser
  // l'encaissement parce qu'une colonne facultative n'a pas été écrite.
  await stampNonprofitVerification(ctx.tenantId, check.organizationName);

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'store_social_credentials',
    entity_type: 'integration_secret',
    entity_id: 'helloasso_client_id',
    tenant_id: ctx.tenantId,
    payload: {
      organizationSlug,
      organizationName: check.organizationName,
      nonprofitVerified: true,
    },
  });

  const tenantSlug = await readTenantSlug(ctx.tenantId);
  return res.status(200).json({
    connected: true,
    organizationSlug,
    organizationName: check.organizationName,
    notificationUrl: tenantSlug
      ? helloAssoNotificationUrl(absoluteSiteUrl('/'), tenantSlug, ctx.tenantId)
      : null,
  });
}

async function handleDelete(
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (ctx.tenantId === DEFAULT_TENANT_ID) {
    return res.status(400).json({
      error:
        'Cet espace encaisse sur le compte de l’association (variables d’environnement).',
      code: 'PLATFORM_ACCOUNT',
    });
  }
  try {
    await deleteIntegrationSecret(ctx.tenantId, 'helloasso_client_id');
    await deleteIntegrationSecret(ctx.tenantId, 'helloasso_client_secret');
    await deleteIntegrationSecret(ctx.tenantId, 'helloasso_org_slug');
  } catch (err) {
    logger.error('[admin/helloasso] suppression impossible', err);
    return res.status(500).json({ error: 'Le compte n’a pas pu être délié.' });
  }

  await clearNonprofitVerification(ctx.tenantId);

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'store_social_credentials',
    entity_type: 'integration_secret',
    entity_id: 'helloasso_client_id',
    tenant_id: ctx.tenantId,
    payload: { removed: true, nonprofitVerified: false },
  });

  return res.status(200).json({ connected: false });
}
