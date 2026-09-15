// pages/api/admin/circuit-partners/index.ts
//
// GET : les candidatures à l'offre partenaire des circuits féminins et mixtes,
// les plus récentes d'abord, avec le compte par statut.
//
// PORTÉE PLATEFORME (`manage_tenant`, `scope: 'platform'`), comme la file
// d'onboarding : l'offre pose un plan sur un espace quelconque, un propriétaire
// d'espace tiers n'a ni à lire ces dossiers ni à s'en accorder un.
// L'IP et l'agent utilisateur ne sortent pas : ils servent à l'anti-spam.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';

export const CIRCUIT_APPLICATION_COLUMNS =
  'id, created_at, updated_at, organization_name, contact_name, email, game, format, season_start, expected_teams, website, community_url, existing_tenant_slug, message, commits_code_of_conduct, commits_safety_lead, status, admin_notes, granted_tenant_id, granted_plan, granted_until, decided_at';

const STATUSES = ['new', 'reviewing', 'approved', 'rejected'] as const;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const status =
    typeof req.query.status === 'string' &&
    (STATUSES as readonly string[]).includes(req.query.status)
      ? req.query.status
      : null;

  let query = supabaseAdmin
    .from('circuit_partner_applications')
    .select(CIRCUIT_APPLICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) {
    logger.error('[admin/circuit-partners] list error: %s', error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  // Le slug de l'espace qui a reçu l'offre : celui qu'indiquait la candidature
  // peut différer de celui que le staff a finalement retenu.
  const items = (data ?? []) as unknown as Array<
    Record<string, unknown> & { granted_tenant_id: string | null }
  >;
  const grantedIds = [
    ...new Set(
      items
        .map((item) => item.granted_tenant_id)
        .filter((id): id is string => typeof id === 'string')
    ),
  ];
  const slugById = new Map<string, string>();
  if (grantedIds.length > 0) {
    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, slug')
      .in('id', grantedIds);
    if (tenantError) {
      logger.error(
        '[admin/circuit-partners] tenants error: %s',
        tenantError.message
      );
      return res.status(500).json({ error: 'Lecture impossible.' });
    }
    for (const row of (tenants ?? []) as Array<{ id: string; slug: string }>) {
      slugById.set(row.id, row.slug);
    }
  }

  const { data: all, error: countError } = await supabaseAdmin
    .from('circuit_partner_applications')
    .select('status');
  if (countError) {
    logger.error(
      '[admin/circuit-partners] count error: %s',
      countError.message
    );
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const counts: Record<string, number> = Object.fromEntries(
    STATUSES.map((s) => [s, 0])
  );
  for (const row of (all ?? []) as Array<{ status: string }>) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  return res.status(200).json({
    items: items.map((item) => ({
      ...item,
      granted_tenant_slug: item.granted_tenant_id
        ? (slugById.get(item.granted_tenant_id) ?? null)
        : null,
    })),
    counts,
  });
}

export default withStaffRoute(handler, {
  permission: 'manage_tenant',
  scope: 'platform',
});
