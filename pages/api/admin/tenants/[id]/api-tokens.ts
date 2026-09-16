// pages/api/admin/tenants/[id]/api-tokens.ts
//
// GET  — les clés d'API d'un espace NOMMÉ (métadonnées seules : jamais le hash,
//        jamais un clair). Révoquées comprises, pour que l'écran puisse dire
//        « il y en avait une, elle a été retirée ».
// POST — émet une clé pour CET espace. Le clair n'est rendu qu'ici, une fois.
//
// POURQUOI CETTE ROUTE EXISTE, à côté de `/api/admin/api-tokens`. Cette
// dernière émet pour l'espace ACTIF du sélecteur, que son écran ne nomme nulle
// part : une clé destinée à un partenaire s'est retrouvée rattachée à l'espace
// historique, servant des données valides et fausses. Depuis le hub
// d'onboarding, l'espace visé est dans l'URL — il ne peut plus être deviné de
// travers.
//
// Auth : owner de la PLATEFORME. Émettre pour un espace dont on n'est pas
// l'espace actif est un geste d'opérateur, pas une commodité d'admin ; c'est
// la même garde que `POST /tenants/[id]/staff`, qui rattache une personne à un
// espace tiers.
//
// L'émission elle-même vit dans `utils/apiTokens/mintTenantApiToken.ts`, partagé
// avec l'autre route : deux implémentations jumelées divergeraient.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  requireOwner,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import { mintTenantApiToken } from '@/utils/apiTokens/mintTenantApiToken';

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
      'admin-tenant-api-tokens'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Database service unavailable.' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tenant id.' });
  }

  if (!requireOwner(ctx, res)) return;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('tenant_api_tokens')
      .select(
        'id, name, token_prefix, scopes, created_at, last_used_at, revoked_at, expires_at, comp, comp_note'
      )
      .eq('tenant_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[admin/tenants/api-tokens] list error', error, {
        tenantId: id,
      });
      return res.status(500).json({ error: 'Server error.' });
    }
    return res.status(200).json({ tokens: data ?? [] });
  }

  if (req.method === 'POST') {
    const result = await mintTenantApiToken({
      tenantId: id,
      actor: { staffId: ctx.staff.id, role: ctx.role },
      body: req.body,
    });

    if (!result.ok) return res.status(result.status).json(result.body);

    return res
      .status(201)
      .json({ token: result.token, tokenMeta: result.tokenMeta });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}

export default withStaffRoute(handler, {
  permission: 'manage_tenant',
  scope: 'platform',
});
