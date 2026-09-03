// pages/api/admin/email/credentials.ts
//
// Compte d'envoi d'emails DE L'ESPACE : clé API Brevo + adresse d'expédition.
//
// Pourquoi chaque espace apporte le sien. Un email transactionnel engage une
// identité : il part d'un domaine, il compte dans un quota, il construit (ou
// abîme) une réputation d'expéditeur. Faire transiter les emails d'un autre
// tournoi par notre compte reviendrait à signer de notre nom des messages que
// nous n'écrivons pas, à leur offrir nos 300 envois quotidiens, et à faire
// porter à notre domaine le poids de leurs plaintes pour spam. Sans compte
// configuré, l'espace n'envoie donc pas d'email — le reste fonctionne
// (Discord, site, bot), et l'échec est explicite plutôt que silencieux.
//
// La clé est chiffrée côté serveur (`SECRETS_ENC_KEY`) et n'est jamais relue
// par un client — même modèle que les identifiants Bluesky et Instagram.
//
// GET — dit si l'envoi est configuré, et depuis quelle adresse. Jamais la clé.
// PUT — enregistre clé + adresse (+ nom affiché), après vérification auprès
//       de Brevo que la clé est acceptée.
// DELETE — retire le compte (l'espace cesse d'envoyer des emails).
//
// Auth : session staff porteuse de `manage_settings`, scopée au tenant actif.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  deleteIntegrationSecret,
  getIntegrationSecret,
  hasIntegrationSecret,
  isSecretEncryptionConfigured,
  setIntegrationSecret,
} from '@/utils/integrationSecrets';
import { logStaffAction } from '@/utils/staffLogs';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default withStaffRoute(handler, { permission: 'manage_settings' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'admin-email-creds')
  ) {
    return;
  }
  if (req.method === 'GET') return handleGet(res, ctx);
  if (req.method === 'PUT') return handlePut(req, res, ctx);
  if (req.method === 'DELETE') return handleDelete(res, ctx);
  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  // L'espace historique envoie via le compte de la plateforme : il n'a rien à
  // configurer, et le dire évite qu'on lui invente un problème.
  if (ctx.tenantId === DEFAULT_TENANT_ID) {
    return res.status(200).json({
      usesPlatformAccount: true,
      configured: Boolean(process.env.BREVO_API_KEY),
      fromEmail: process.env.EMAIL_FROM ?? null,
      fromName: process.env.EMAIL_FROM_NAME ?? null,
      encryptionReady: isSecretEncryptionConfigured(),
    });
  }

  const [hasKey, fromEmail, fromName] = await Promise.all([
    hasIntegrationSecret(ctx.tenantId, 'brevo_api_key'),
    getIntegrationSecret(ctx.tenantId, 'brevo_from_email'),
    getIntegrationSecret(ctx.tenantId, 'brevo_from_name'),
  ]);

  return res.status(200).json({
    usesPlatformAccount: false,
    configured: Boolean(hasKey && fromEmail),
    fromEmail: fromEmail ?? null,
    fromName: fromName ?? null,
    encryptionReady: isSecretEncryptionConfigured(),
  });
}

/**
 * Valide la clé auprès de Brevo et renvoie les adresses d'expédition déclarées
 * sur le compte. Une clé fausse enregistrée ne se manifesterait qu'au premier
 * envoi réel — un check-in J-1, typiquement.
 */
async function verifyBrevoKey(
  apiKey: string
): Promise<{ ok: true; senders: string[] } | { ok: false; error: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const r = await fetch('https://api.brevo.com/v3/senders', {
      headers: { 'api-key': apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (r.status === 401) return { ok: false, error: 'Clé API refusée par Brevo.' };
    if (!r.ok) return { ok: false, error: `Brevo a répondu HTTP ${r.status}.` };

    const data = (await r.json().catch(() => null)) as {
      senders?: Array<{ email?: string; active?: boolean }>;
    } | null;
    const senders = (data?.senders ?? [])
      .filter((s) => s.active !== false && typeof s.email === 'string')
      .map((s) => (s.email as string).toLowerCase());
    return { ok: true, senders };
  } catch (err) {
    return {
      ok: false,
      error: `Brevo injoignable : ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (ctx.tenantId === DEFAULT_TENANT_ID) {
    return res.status(400).json({
      error:
        'Cet espace envoie via le compte de la plateforme (variables d’environnement).',
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
    apiKey?: unknown;
    fromEmail?: unknown;
    fromName?: unknown;
  };
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const fromEmail =
    typeof body.fromEmail === 'string'
      ? body.fromEmail.trim().toLowerCase()
      : '';
  const fromName =
    typeof body.fromName === 'string' ? body.fromName.trim().slice(0, 70) : '';

  if (!apiKey) {
    return res.status(400).json({ error: 'Clé API Brevo requise.' });
  }
  if (!EMAIL_RE.test(fromEmail)) {
    return res.status(400).json({ error: 'Adresse d’expédition invalide.' });
  }

  const check = await verifyBrevoKey(apiKey);
  if (!check.ok) {
    return res.status(400).json({ error: check.error });
  }
  // Brevo refuse d'expédier depuis une adresse non vérifiée sur le compte :
  // autant le dire ici, où l'opérateur peut agir, plutôt qu'au premier envoi.
  if (check.senders.length > 0 && !check.senders.includes(fromEmail)) {
    return res.status(400).json({
      error:
        `L’adresse ${fromEmail} n’est pas un expéditeur vérifié de ce compte Brevo. ` +
        `Expéditeurs disponibles : ${check.senders.join(', ')}.`,
      code: 'SENDER_NOT_VERIFIED',
    });
  }

  try {
    await setIntegrationSecret(
      ctx.tenantId,
      'brevo_api_key',
      apiKey,
      ctx.staff?.id ?? null
    );
    await setIntegrationSecret(
      ctx.tenantId,
      'brevo_from_email',
      fromEmail,
      ctx.staff?.id ?? null
    );
    if (fromName) {
      await setIntegrationSecret(
        ctx.tenantId,
        'brevo_from_name',
        fromName,
        ctx.staff?.id ?? null
      );
    }
  } catch (err) {
    logger.error('[admin/email] enregistrement impossible', err);
    return res
      .status(500)
      .json({ error: 'Les identifiants n’ont pas pu être enregistrés.' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'store_social_credentials',
      entity_type: 'integration_secret',
      entity_id: 'brevo_api_key',
      tenant_id: ctx.tenantId,
      // La clé n'est évidemment pas journalisée : seule l'adresse l'est.
      payload: { platform: 'brevo', fromEmail },
    });
  } catch (logErr) {
    logger.error('[admin/email] journalisation impossible', logErr);
  }

  return res.status(200).json({ configured: true, fromEmail, fromName });
}

async function handleDelete(
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (ctx.tenantId === DEFAULT_TENANT_ID) {
    return res.status(400).json({
      error:
        'Cet espace envoie via le compte de la plateforme (variables d’environnement).',
      code: 'PLATFORM_ACCOUNT',
    });
  }
  try {
    await deleteIntegrationSecret(ctx.tenantId, 'brevo_api_key');
    await deleteIntegrationSecret(ctx.tenantId, 'brevo_from_email');
    await deleteIntegrationSecret(ctx.tenantId, 'brevo_from_name');
  } catch (err) {
    logger.error('[admin/email] suppression impossible', err);
    return res.status(500).json({ error: 'Suppression impossible.' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'store_social_credentials',
      entity_type: 'integration_secret',
      entity_id: 'brevo_api_key',
      tenant_id: ctx.tenantId,
      payload: { platform: 'brevo', cleared: true },
    });
  } catch (logErr) {
    logger.error('[admin/email] journalisation impossible', logErr);
  }

  return res.status(200).json({ configured: false });
}
