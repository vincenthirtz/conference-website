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

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { mintTenantApiToken } from '@/utils/apiTokens/mintTenantApiToken';

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
      'id, name, token_prefix, scopes, created_at, last_used_at, revoked_at, expires_at, created_by, comp, comp_note'
    )
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[admin/api-tokens] list error', error, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }

  const rows = data ?? [];

  // Résout le nom du créateur (audit) via une requête staff séparée — pas
  // d'embed PostgREST (created_by est une colonne d'audit sans FK).
  const creatorIds = [
    ...new Set(
      rows.map((r) => r.created_by).filter((v): v is string => Boolean(v))
    ),
  ];
  const nameById = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: staffRows } = await supabaseAdmin
      .from('staff')
      .select('id, display_name')
      .in('id', creatorIds);
    for (const s of staffRows ?? []) {
      if (s.display_name)
        nameById.set(s.id as string, s.display_name as string);
    }
  }

  const tokens = rows.map((r) => ({
    ...r,
    created_by_name: r.created_by ? (nameById.get(r.created_by) ?? null) : null,
  }));

  return res.status(200).json({ tokens });
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  // L'émission elle-même vit dans `utils/apiTokens/mintTenantApiToken.ts` :
  // le hub d'onboarding émet pour un espace NOMMÉ, cette route pour l'espace
  // ACTIF, et deux implémentations jumelées finiraient par diverger.
  const result = await mintTenantApiToken({
    tenantId: ctx.tenantId,
    actor: { staffId: ctx.staff.id, role: ctx.role },
    body: req.body,
  });

  if (!result.ok) return res.status(result.status).json(result.body);

  // `token` (plain) est renvoyé UNE SEULE FOIS ici.
  return res
    .status(201)
    .json({ token: result.token, tokenMeta: result.tokenMeta });
}

export default withStaffRoute(handler, { permission: 'manage_settings' });
