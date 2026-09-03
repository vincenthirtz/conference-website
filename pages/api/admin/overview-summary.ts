// pages/api/admin/overview-summary.ts
// GET : agrégat des KPI globaux du hub admin (/admin) en une seule requête.
//
// Remplace les 5 appels parallèles que le hub faisait jusqu'ici
// (tournaments?status=running, teams, demandes?status=pending,
//  support/tickets, disputes) par UN seul endpoint qui exécute des
// count-only (head:true, count:'exact') en parallèle — aucune ligne n'est
// chargée, seuls les totaux remontent.
//
// Définitions (alignées sur les KPI existants du hub, cf. pages/admin/index.tsx) :
//   - tournamentsActive : tournois `status = 'running'`            (tenant-scoped)
//   - teams             : total équipes                            (tenant-scoped)
//   - demandesPending   : demandes `status = 'pending'`            (tenant-scoped)
//   - supportOpen       : tickets support `status = 'open'`        (GLOBAL — voir ci-dessous)
//   - supportHigh       : tickets `severity = 'high'` AND status != resolved/closed
//                         (réplique pages/api/admin/support/tickets.ts ; GLOBAL)
//   - disputesOpen      : matches `status = 'disputed'`            (tenant-scoped ;
//                         réplique le board pages/api/admin/disputes/index.ts dont
//                         counts.total = tous les litiges ouverts du tenant)
//
// MULTI-TENANT : tous les comptes sont scopés par `.eq('tenant_id', ctx.tenantId)`,
// support compris depuis que `support_tickets` porte la colonne (migration
// add_tenant_id_to_support_tickets.sql).
//
// Dégradation : on utilise Promise.allSettled + count-only. Si un count échoue
// (erreur DB, rejet), on renvoie `null` pour CETTE clé et 200 pour le reste.
// `null` (et non 0) est la convention déjà retenue côté hub pour distinguer
// « inconnu / en échec » de « zéro » (cf. l'état Kpis dans pages/admin/index.tsx).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '../../../utils/logger';

export type OverviewSummary = {
  tournamentsActive: number | null;
  teams: number | null;
  demandesPending: number | null;
  supportOpen: number | null;
  supportHigh: number | null;
  disputesOpen: number | null;
};

type ApiResponse = OverviewSummary | { error: string };

// Rôle minimum : manager (mêmes droits que les endpoints sources tournaments /
// teams / demandes / support / disputes côté hub).
// Agrégat TRANSVERSE (tournois, équipes, demandes, support, litiges) : aucune
// permission unique ne le décrit, et le découper en cinq appels pour respecter
// la forme serait pire que le mal. Il reste donc gardé par rôle, et la page qui
// le consomme ne l'appelle que pour un admin (`canManage`).
export default withStaffRoute(handler, 'admin');

/**
 * Résout une PromiseSettledResult de count-only en `number | null` :
 *   - rejet de la promesse           → null
 *   - erreur PostgREST dans le retour → null
 *   - sinon `count` (0 si null/undef côté driver, le set est vide)
 */
function resolveCount(
  result: PromiseSettledResult<{ count: number | null; error: unknown }>,
  label: string
): number | null {
  if (result.status !== 'fulfilled') {
    logger.error(`[admin/overview-summary] ${label} rejected:`, result.reason);
    return null;
  }
  if (result.value.error) {
    logger.error(
      `[admin/overview-summary] ${label} error:`,
      result.value.error
    );
    return null;
  }
  return result.value.count ?? 0;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  // 60 req/min/IP : le hub recharge ces KPI ponctuellement, large marge.
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-overview-summary'
    )
  )
    return;

  const tenantId = ctx.tenantId;

  // Tous les comptes sont count-only (head:true) → aucune ligne transférée.
  const [
    tournamentsActiveR,
    teamsR,
    demandesPendingR,
    supportOpenR,
    supportHighR,
    disputesOpenR,
  ] = await Promise.allSettled([
    // tournois en cours (tenant-scoped)
    supabaseAdmin
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'running'),

    // total équipes (tenant-scoped)
    supabaseAdmin
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),

    // demandes en attente (tenant-scoped)
    supabaseAdmin
      .from('demandes')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending'),

    // tickets support ouverts
    supabaseAdmin
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'open'),

    // tickets support haute sévérité encore actionnables.
    // Réplique pages/api/admin/support/tickets.ts : severity=high AND
    // status != resolved AND status != closed (≡ "not in (resolved, closed)").
    supabaseAdmin
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .eq('severity', 'high')
      .neq('status', 'resolved')
      .neq('status', 'closed'),

    // litiges ouverts = matches status='disputed' (tenant-scoped).
    // Réplique le filtre du board pages/api/admin/disputes/index.ts dont
    // counts.total agrège tous les matches disputés du tenant.
    supabaseAdmin
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'disputed'),
  ]);

  const summary: OverviewSummary = {
    tournamentsActive: resolveCount(tournamentsActiveR, 'tournamentsActive'),
    teams: resolveCount(teamsR, 'teams'),
    demandesPending: resolveCount(demandesPendingR, 'demandesPending'),
    supportOpen: resolveCount(supportOpenR, 'supportOpen'),
    supportHigh: resolveCount(supportHighR, 'supportHigh'),
    disputesOpen: resolveCount(disputesOpenR, 'disputesOpen'),
  };

  res.setHeader('Cache-Control', 'private, max-age=30');
  return res.status(200).json(summary);
}
