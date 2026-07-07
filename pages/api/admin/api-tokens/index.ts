// pages/api/admin/api-tokens/index.ts
//
// GET  — list the active tenant's public API tokens (metadata only : never the
//        hash, never a plain token). Includes revoked ones so the operator can
//        audit; the UI greys them out.
// POST — mint a new scoped API token for the active tenant. The **plain** token
//        is returned ONCE in the response — it is the only moment it is ever
//        visible. It is sha256-hashed for storage and NOT logged.
//
// Auth : admin+ on the active tenant (withStaffRoute default). Tokens are
// tenant-scoped via `ctx.tenantId` — an admin can only mint/list tokens for the
// tenant they are currently acting on.
//
// Rate-limited at 10/min per IP.
//
// Audit : staff_logs action='other', payload `{ action: 'create_api_token', ... }`.
// The token (plain or hash) is NEVER persisted in the audit log.

import crypto from 'crypto';
import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { parseScopes, ALL_SCOPES } from '@/utils/apiScopes';

const TOKEN_PLAIN_PREFIX = 'pk_live_';

/** `pk_live_` + 64 hex chars. Prefix stored in clear for admin identification. */
function generateToken(): { plain: string; hash: string; prefix: string } {
  const plain = TOKEN_PLAIN_PREFIX + crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(plain).digest('hex');
  // `pk_live_` (8) + 6 hex chars → e.g. `pk_live_a1b2c3`.
  const prefix = plain.slice(0, TOKEN_PLAIN_PREFIX.length + 6);
  return { plain, hash, prefix };
}

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string()).min(1),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'admin-api-tokens')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') return handleList(req, res, ctx);
  if (req.method === 'POST') return handleCreate(req, res, ctx);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handleList(
  _req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data, error } = await supabaseAdmin
    .from('tenant_api_tokens')
    .select(
      'id, name, token_prefix, scopes, created_at, last_used_at, revoked_at'
    )
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[admin/api-tokens] list error', error, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }

  return res.status(200).json({ tokens: data ?? [] });
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid body.', code: 'INVALID_BODY' });
  }

  const scopeResult = parseScopes(parsed.data.scopes);
  if (!scopeResult.ok) {
    return res.status(400).json({
      error: `Scopes invalides : ${scopeResult.invalid.join(', ')}.`,
      code: 'INVALID_SCOPES',
      validScopes: ALL_SCOPES,
    });
  }

  const { plain, hash, prefix } = generateToken();

  const { data, error } = await supabaseAdmin
    .from('tenant_api_tokens')
    .insert({
      tenant_id: ctx.tenantId,
      token_hash: hash,
      token_prefix: prefix,
      name: parsed.data.name,
      scopes: scopeResult.scopes,
    })
    .select('id, name, token_prefix, scopes, created_at')
    .single();

  if (error || !data) {
    logger.error('[admin/api-tokens] insert error', error, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to create token.' });
  }

  // Audit — jamais le plain ni le hash.
  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'api_token',
    entity_id: data.id,
    tenant_id: ctx.tenantId,
    payload: {
      action: 'create_api_token',
      name: data.name,
      scopes: scopeResult.scopes,
      prefix,
    },
  });

  // `token` (plain) est renvoyé UNE SEULE FOIS ici.
  return res.status(201).json({ token: plain, tokenMeta: data });
}

export default withStaffRoute(handler, 'admin');
