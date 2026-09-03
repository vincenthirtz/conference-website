// pages/api/admin/tenants/[id]/export.ts
//
// POST : rend TOUTES les données d'un espace, en une archive JSON.
//
// Il n'y avait aucune sortie. Le hard-delete est interdit (les clés étrangères
// sont en `ON DELETE RESTRICT`), et rien ne le remplaçait : un organisateur qui
// part ne pouvait ni récupérer ses tournois, ni en obtenir l'effacement — ce
// que le RGPD lui donne pourtant le droit de demander.
//
// Le contenu est piloté par le manifeste `utils/tenants/tenantTables.ts` :
// ajouter une table `tenant_id` au schéma l'ajoute à l'export. Une liste
// recopiée ici serait incomplète dès la table suivante, sans que rien ne le
// signale.
//
// Ce qui n'y figure PAS, volontairement : les secrets (clés d'API, jetons,
// identifiants d'intégration). Les rendre dans une archive remise à quelqu'un
// qui part serait une fuite avec accusé de réception. Les caches techniques
// (idempotence, verrous) non plus : ils ne décrivent rien.
//
// Portée : owner de la plateforme. Sortir l'intégralité des données d'un espace
// n'est pas un geste d'exploitation courante.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  requireOwner,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { EXPORTABLE_TABLES } from '@/utils/tenants/tenantTables';

/**
 * Plafond par table. Une archive doit tenir dans une réponse ; au-delà, on le
 * DIT (`truncated`) plutôt que de rendre un export silencieusement partiel —
 * une archive qui ment est pire qu'une archive absente.
 */
const MAX_ROWS_PER_TABLE = 5_000;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 3, windowMs: 300_000 }, 'admin-tenant-export')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  switch (req.method) {
    case 'POST':
      break;
    default:
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireOwner(ctx, res)) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, created_at, plan, lifecycle_state')
    .eq('id', id)
    .maybeSingle();

  if (!tenant) {
    return res
      .status(404)
      .json({ error: 'Tenant not found.', code: 'UNKNOWN_TENANT' });
  }

  const data: Record<string, unknown[]> = {};
  const truncated: string[] = [];
  const failed: string[] = [];

  for (const table of EXPORTABLE_TABLES) {
    const { data: rows, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('tenant_id', id)
      .limit(MAX_ROWS_PER_TABLE);

    if (error) {
      // Une table en erreur est NOMMÉE dans le rapport. La taire donnerait une
      // archive incomplète qui a l'air complète.
      logger.error('[admin/tenant-export] table failed', {
        table,
        error: error.message,
      });
      failed.push(table);
      continue;
    }
    const list = rows ?? [];
    if (list.length > 0) data[table] = list;
    if (list.length === MAX_ROWS_PER_TABLE) truncated.push(table);
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'export_tenant',
        tables: Object.keys(data).length,
        truncated: truncated.length,
        failed: failed.length,
      },
    });
  } catch (logErr) {
    logger.error('logStaffAction(export_tenant) error:', logErr);
  }

  const t = tenant as { slug: string };
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="export-${t.slug}-${new Date().toISOString().slice(0, 10)}.json"`
  );

  return res.status(200).json({
    exportedAt: new Date().toISOString(),
    tenant,
    // Le rapport avant les données : c'est lui qu'on relit pour savoir si
    // l'archive vaut quelque chose.
    report: {
      tables: Object.keys(data).length,
      rows: Object.values(data).reduce((n, rows) => n + rows.length, 0),
      truncated,
      failed,
      excluded:
        'Secrets et caches techniques (clés, jetons, idempotence) exclus par construction.',
    },
    data,
  });
}

export default withStaffRoute(handler, { permission: 'manage_tenant' });
