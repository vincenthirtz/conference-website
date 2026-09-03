// pages/api/admin/tenants/[id]/rotate-secrets.ts
//
// POST : rotate the bot API key + webhook secret of a tenant.
//
// Generates two cryptographically-random 32-byte hex strings (64 chars each),
// sha256-hashes the API key for storage, and upserts `tenant_secrets`. The
// **plain** values are returned in the response — this is the only moment
// they will ever be visible to the operator. They are NOT logged. The admin
// UI displays them once in a modal and prompts the operator to copy them
// into their secret manager.
//
// Rotation SANS COUPURE (T8) : l'empreinte courante devient la « précédente »
// et reste acceptée 48 h, le temps d'aller reposer la nouvelle valeur sur le
// serveur du bot. Avant ça, régénérer coupait le bot à la milliseconde où
// l'écran affichait la nouvelle clé — une opération à fenêtre de panne pour un
// geste qui devrait être anodin.
//
// DELETE : révoque immédiatement la clé précédente, sans toucher à la courante.
// C'est le geste d'une fuite : on ne veut alors surtout PAS attendre 48 h.
//
// Auth : owner-only. Rotating bot secrets revokes the bot's current API key
// and forces a redeploy with the new value — only the owner role is allowed
// to trigger this kind of disruptive operation.
//
// Rate-limited at 5/min per IP to slow down a compromised admin session.
//
// Audit : an entry is added to `staff_logs` with action='other' and payload
// `{ action: 'rotate_bot_secrets', tenantId, ... }`. The secrets themselves
// are NEVER persisted in the audit log.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { invalidateBotApiKeyCache } from '@/utils/botAuth';

/**
 * Durée pendant laquelle l'ancienne clé reste acceptée. 48 h : assez pour
 * qu'un déploiement passe un week-end, assez court pour qu'une clé remplacée
 * ne traîne pas.
 */
const GRACE_MS = 48 * 60 * 60 * 1000;

function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60_000 },
      'admin-tenants-rotate-secrets'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  // Méthodes en correspondance POSITIVE : le garde-fou de dérive openapi lit ce
  // bloc pour savoir ce que le handler accepte, et une cascade de négations ne
  // lui dit rien.
  switch (req.method) {
    case 'POST':
    case 'DELETE':
      break;
    default:
      res.setHeader('Allow', 'POST, DELETE');
      return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  // Vérifie que le tenant existe (et reste consistent avec les FK ON DELETE
  // CASCADE de tenant_secrets — un orphan ne devrait jamais arriver mais
  // mieux vaut un 404 clair qu'un INSERT qui plante sur la FK).
  const { data: tenantRow, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name')
    .eq('id', id)
    .maybeSingle();
  if (tenantErr) {
    logger.error(
      '[admin/tenants/rotate-secrets] tenant lookup error',
      tenantErr
    );
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!tenantRow) {
    return res
      .status(404)
      .json({ error: 'Tenant not found.', code: 'UNKNOWN_TENANT' });
  }

  // DELETE : révocation immédiate de la clé précédente.
  if (req.method === 'DELETE') {
    const { error: revokeErr } = await supabaseAdmin
      .from('tenant_secrets')
      .update({ previous_key_hash: null, previous_key_expires_at: null })
      .eq('tenant_id', id);
    if (revokeErr) {
      logger.error('[admin/tenants/rotate-secrets] revoke error', revokeErr);
      return res.status(500).json({ error: 'Failed to revoke previous key.' });
    }
    // Une clé révoquée doit cesser MAINTENANT : le cache d'authentification la
    // garderait sinon jusqu'à une minute de plus.
    invalidateBotApiKeyCache(id);
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'revoke_previous_bot_key',
        tenantSlug: tenantRow.slug,
      },
    });
    return res.status(200).json({ tenantId: id, previousKeyRevoked: true });
  }

  // L'empreinte courante devient la précédente : c'est elle qui tient le bot
  // en vie pendant qu'on va reposer la nouvelle valeur.
  const { data: currentRow } = await supabaseAdmin
    .from('tenant_secrets')
    .select('bot_api_key_hash')
    .eq('tenant_id', id)
    .maybeSingle();
  const previousKeyHash =
    (currentRow as { bot_api_key_hash?: string | null } | null)
      ?.bot_api_key_hash ?? null;

  const botApiKey = generateSecret();
  const botWebhookSecret = generateSecret();
  const botApiKeyHash = sha256Hex(botApiKey);
  const rotatedAt = new Date().toISOString();

  const { error: upsertErr } = await supabaseAdmin
    .from('tenant_secrets')
    .upsert(
      {
        tenant_id: id,
        bot_api_key_hash: botApiKeyHash,
        bot_webhook_secret: botWebhookSecret,
        rotated_at: rotatedAt,
        previous_key_hash: previousKeyHash,
        previous_key_expires_at: previousKeyHash
          ? new Date(Date.now() + GRACE_MS).toISOString()
          : null,
      },
      { onConflict: 'tenant_id' }
    );
  if (upsertErr) {
    logger.error('[admin/tenants/rotate-secrets] upsert error', upsertErr, {
      tenantId: id,
    });
    return res.status(500).json({ error: 'Failed to persist new secrets.' });
  }

  // La clé qui vient d'être remplacée ne doit pas survivre dans le cache avec
  // ses anciens droits.
  invalidateBotApiKeyCache(id);

  // Audit. Pas de secret dans le payload.
  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'tenant',
    entity_id: id,
    tenant_id: id,
    payload: {
      action: 'rotate_bot_secrets',
      tenantSlug: tenantRow.slug,
      previousKeyKeptFor: previousKeyHash ? '48h' : null,
    },
  });

  return res.status(200).json({
    tenantId: id,
    botApiKey,
    botWebhookSecret,
    rotatedAt,
    // De quoi dire à l'écran « l'ancienne clé reste valable jusqu'à… », plutôt
    // que de laisser croire à une coupure immédiate.
    previousKeyValidUntil: previousKeyHash
      ? new Date(Date.now() + GRACE_MS).toISOString()
      : null,
  });
}

export default withStaffRoute(handler, { permission: 'manage_tenant' });
