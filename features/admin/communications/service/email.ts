// features/admin/communications/service/email.ts — compte d'envoi de
// l'espace (clé Brevo chiffrée), journal des événements Brevo, email de test.
//
// Messages, statuts et `code` historiques conservés (`PLATFORM_ACCOUNT`,
// `SENDER_NOT_VERIFIED`) : l'écran de réglages les lit.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { AuditDetails } from '@/utils/admin/defineAdminRoute';
import { LegacyAdminError } from '@/utils/admin/errors';
import type { Audited } from '../../_shared/audited';
import {
  deleteIntegrationSecret,
  getIntegrationSecret,
  hasIntegrationSecret,
  isSecretEncryptionConfigured,
  setIntegrationSecret,
} from '@/utils/integrationSecrets';
import { sendTestEmail as sendTestEmailUtil } from '@/utils/email';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

/* ------------------------------ Email de test ------------------------------ */

export async function sendTestEmail(body: Record<string, unknown>) {
  const to = body.to;
  if (!to || typeof to !== 'string') {
    throw new LegacyAdminError(400, 'Missing "to" email address');
  }
  const result = await sendTestEmailUtil(to);
  if (!result.success) {
    // 502 + corps historique `{ success: false, error? }`.
    throw new LegacyAdminError(502, result.error ?? 'Email send failed', {
      extra: { ...result },
    });
  }
  return result;
}

/* ------------------------------ Journal Brevo ------------------------------ */

type BrevoEvent = {
  email: string;
  date: string;
  messageId: string;
  event: string;
  subject: string;
  tag: string;
  from: string;
  templateId: number | null;
};

export type BrevoEventsResponse = { events: BrevoEvent[] };

export async function listEmailLogs(
  ctx: ServiceContext,
  query: Record<string, unknown>
): Promise<BrevoEventsResponse> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new LegacyAdminError(500, 'BREVO_API_KEY not configured');
  }

  const params = new URLSearchParams();
  params.set('limit', String(query.limit ?? '50'));
  params.set('offset', String(query.offset ?? '0'));
  params.set('sort', 'desc');
  for (const key of ['email', 'event', 'startDate', 'endDate'] as const) {
    const v = query[key];
    if (v && typeof v === 'string') params.set(key, v);
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.brevo.com/v3/smtp/statistics/events?${params.toString()}`,
      { headers: { 'api-key': apiKey, Accept: 'application/json' } }
    );
  } catch (err) {
    ctx.logger.error('[email-logs] fetch error:', err);
    throw new LegacyAdminError(502, 'Failed to reach Brevo API');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new LegacyAdminError(
      response.status,
      data?.message || `Brevo API error: ${response.status}`
    );
  }
  try {
    return (await response.json()) as BrevoEventsResponse;
  } catch (err) {
    ctx.logger.error('[email-logs] fetch error:', err);
    throw new LegacyAdminError(502, 'Failed to reach Brevo API');
  }
}

/* ------------------------------ Compte d'envoi ----------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const PLATFORM_ACCOUNT_ERROR = () =>
  new LegacyAdminError(
    400,
    'Cet espace envoie via le compte de la plateforme (variables d’environnement).',
    { code: 'PLATFORM_ACCOUNT' }
  );

export async function getEmailCredentials(ctx: ServiceContext) {
  // L'espace historique envoie via le compte de la plateforme : il n'a rien à
  // configurer, et le dire évite qu'on lui invente un problème.
  if (ctx.tenantId === DEFAULT_TENANT_ID) {
    return {
      usesPlatformAccount: true,
      configured: Boolean(process.env.BREVO_API_KEY),
      fromEmail: process.env.EMAIL_FROM ?? null,
      fromName: process.env.EMAIL_FROM_NAME ?? null,
      encryptionReady: isSecretEncryptionConfigured(),
    };
  }

  const [hasKey, fromEmail, fromName] = await Promise.all([
    hasIntegrationSecret(ctx.tenantId, 'brevo_api_key'),
    getIntegrationSecret(ctx.tenantId, 'brevo_from_email'),
    getIntegrationSecret(ctx.tenantId, 'brevo_from_name'),
  ]);

  return {
    usesPlatformAccount: false,
    configured: Boolean(hasKey && fromEmail),
    fromEmail: fromEmail ?? null,
    fromName: fromName ?? null,
    encryptionReady: isSecretEncryptionConfigured(),
  };
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

    if (r.status === 401)
      return { ok: false, error: 'Clé API refusée par Brevo.' };
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

const CREDENTIALS_AUDIT: Pick<AuditDetails, 'entity_type' | 'entity_id'> = {
  entity_type: 'integration_secret',
  entity_id: 'brevo_api_key',
};

export async function storeEmailCredentials(
  ctx: ServiceContext,
  body: Record<string, unknown>
): Promise<Audited<{ configured: true; fromEmail: string; fromName: string }>> {
  if (ctx.tenantId === DEFAULT_TENANT_ID) throw PLATFORM_ACCOUNT_ERROR();
  if (!isSecretEncryptionConfigured()) {
    throw new LegacyAdminError(
      503,
      'SECRETS_ENC_KEY absente de l’environnement : impossible de chiffrer.'
    );
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const fromEmail =
    typeof body.fromEmail === 'string'
      ? body.fromEmail.trim().toLowerCase()
      : '';
  const fromName =
    typeof body.fromName === 'string' ? body.fromName.trim().slice(0, 70) : '';

  if (!apiKey) throw new LegacyAdminError(400, 'Clé API Brevo requise.');
  if (!EMAIL_RE.test(fromEmail)) {
    throw new LegacyAdminError(400, 'Adresse d’expédition invalide.');
  }

  const check = await verifyBrevoKey(apiKey);
  if (!check.ok) throw new LegacyAdminError(400, check.error);
  // Brevo refuse d'expédier depuis une adresse non vérifiée sur le compte :
  // autant le dire ici, où l'opérateur peut agir, plutôt qu'au premier envoi.
  if (check.senders.length > 0 && !check.senders.includes(fromEmail)) {
    throw new LegacyAdminError(
      400,
      `L’adresse ${fromEmail} n’est pas un expéditeur vérifié de ce compte Brevo. ` +
        `Expéditeurs disponibles : ${check.senders.join(', ')}.`,
      { code: 'SENDER_NOT_VERIFIED' }
    );
  }

  const staffId = ctx.actor.kind === 'staff' ? ctx.actor.staffId : null;
  try {
    await setIntegrationSecret(ctx.tenantId, 'brevo_api_key', apiKey, staffId);
    await setIntegrationSecret(
      ctx.tenantId,
      'brevo_from_email',
      fromEmail,
      staffId
    );
    if (fromName) {
      await setIntegrationSecret(
        ctx.tenantId,
        'brevo_from_name',
        fromName,
        staffId
      );
    }
  } catch (err) {
    ctx.logger.error('[admin/email] enregistrement impossible', err);
    throw new LegacyAdminError(
      500,
      'Les identifiants n’ont pas pu être enregistrés.'
    );
  }

  return {
    result: { configured: true, fromEmail, fromName },
    // La clé n'est évidemment pas journalisée : seule l'adresse l'est.
    audit: { ...CREDENTIALS_AUDIT, payload: { platform: 'brevo', fromEmail } },
  };
}

export async function clearEmailCredentials(
  ctx: ServiceContext
): Promise<Audited<{ configured: false }>> {
  if (ctx.tenantId === DEFAULT_TENANT_ID) throw PLATFORM_ACCOUNT_ERROR();
  try {
    await deleteIntegrationSecret(ctx.tenantId, 'brevo_api_key');
    await deleteIntegrationSecret(ctx.tenantId, 'brevo_from_email');
    await deleteIntegrationSecret(ctx.tenantId, 'brevo_from_name');
  } catch (err) {
    ctx.logger.error('[admin/email] suppression impossible', err);
    throw new LegacyAdminError(500, 'Suppression impossible.');
  }
  return {
    result: { configured: false },
    audit: {
      ...CREDENTIALS_AUDIT,
      payload: { platform: 'brevo', cleared: true },
    },
  };
}
