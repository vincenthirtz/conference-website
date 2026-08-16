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

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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
      },
      { onConflict: 'tenant_id' }
    );
  if (upsertErr) {
    logger.error('[admin/tenants/rotate-secrets] upsert error', upsertErr, {
      tenantId: id,
    });
    return res.status(500).json({ error: 'Failed to persist new secrets.' });
  }

  // Audit. Pas de secret dans le payload.
  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'tenant',
    entity_id: id,
    tenant_id: id,
    payload: { action: 'rotate_bot_secrets', tenantSlug: tenantRow.slug },
  });

  return res.status(200).json({
    tenantId: id,
    botApiKey,
    botWebhookSecret,
    rotatedAt,
  });
}

export default withStaffRoute(handler, 'owner');
