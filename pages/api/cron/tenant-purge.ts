// pages/api/cron/tenant-purge.ts
//
// Efface pour de bon les espaces dont la purge était programmée et dont
// l'échéance est passée.
//
// C'est la seule opération irréversible de toute la gestion des espaces. Trois
// verrous, dans cet ordre :
//
//   1. l'état DOIT être `purge_scheduled` — un espace simplement archivé n'est
//      jamais touché ;
//   2. `purge_after` doit être dépassé — la fenêtre de rétractation est le
//      cœur du dispositif ;
//   3. l'espace protégé (la plateforme elle-même) est exclu par requête, pas
//      seulement par convention.
//
// L'effacement suit le manifeste `utils/tenants/tenantTables.ts`, secrets et
// caches compris. L'ordre des dépendances n'est pas connu à l'avance : on
// boucle tant que des suppressions progressent, et on s'arrête quand plus rien
// ne bouge. Ce qui reste est NOMMÉ dans le rapport — un effacement partiel qui
// se déclare vaut mieux qu'un effacement partiel qui se tait.
//
// Ce qui n'est JAMAIS touché : les comptes des joueuses et les liens Discord
// globaux. Ils ne sont pas la propriété de l'espace.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { PURGEABLE_TABLES } from '@/utils/tenants/tenantTables';
import { PROTECTED_TENANT_SLUGS } from '@/utils/adminTenants';
import { invalidateLifecycleCache } from '@/utils/tenants/lifecycle';
import { invalidateTenantHostCache } from '@/utils/tenant';

/** Bornes de sécurité : une purge ne doit jamais tourner sans fin. */
const MAX_PASSES = 8;

function checkAuth(req: NextApiRequest): 'missing' | 'ok' | 'mismatch' {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/tenant-purge] CRON_SECRET not configured — refusing');
    return 'missing';
  }
  const header = req.headers.authorization;
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7)
      : '';
  const query = typeof req.query.secret === 'string' ? req.query.secret : '';
  return bearer === secret || query === secret ? 'ok' : 'mismatch';
}

/**
 * Efface les lignes d'un espace, table par table, en repassant tant que ça
 * progresse (les clés étrangères imposent un ordre qu'on ne connaît pas ici).
 */
async function purgeTenantRows(tenantId: string): Promise<{
  cleared: string[];
  remaining: string[];
}> {
  let pending = [...PURGEABLE_TABLES];
  const cleared: string[] = [];

  for (let pass = 0; pass < MAX_PASSES && pending.length > 0; pass += 1) {
    const stillPending: string[] = [];
    for (const table of pending) {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('tenant_id', tenantId);
      if (error) {
        // Très probablement une dépendance encore debout : on retentera au
        // passage suivant, quand ses enfants auront disparu.
        stillPending.push(table);
        continue;
      }
      cleared.push(table);
    }
    if (stillPending.length === pending.length) {
      // Aucun progrès : insister ne changera rien.
      pending = stillPending;
      break;
    }
    pending = stillPending;
  }

  return { cleared, remaining: pending };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const auth = checkAuth(req);
  if (auth === 'missing') {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (auth === 'mismatch') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, purge_after, lifecycle_state')
    .eq('lifecycle_state', 'purge_scheduled')
    .lte('purge_after', nowIso);

  if (error) {
    logger.error('[cron/tenant-purge] load error', error);
    return res.status(500).json({ error: 'Failed to load tenants.' });
  }

  const due = (
    (data ?? []) as Array<{
      id: string;
      slug: string;
      purge_after: string | null;
    }>
  ).filter((t) => !PROTECTED_TENANT_SLUGS.has(t.slug));

  const purged: Array<{ slug: string; cleared: number; remaining: string[] }> =
    [];

  for (const tenant of due) {
    try {
      const { cleared, remaining } = await purgeTenantRows(tenant.id);

      // L'espace passe à `purged` MÊME si des tables résistent : son état doit
      // dire ce qui s'est passé, et le rapport nomme ce qui reste. Le laisser
      // en `purge_scheduled` le ferait rejouer chaque nuit, indéfiniment.
      await supabaseAdmin
        .from('tenants')
        .update({
          lifecycle_state: 'purged',
          lifecycle_changed_at: new Date().toISOString(),
          purge_after: null,
        })
        .eq('id', tenant.id);

      invalidateLifecycleCache(tenant.id);
      invalidateTenantHostCache();

      purged.push({
        slug: tenant.slug,
        cleared: cleared.length,
        remaining,
      });

      logger.warn('[cron/tenant-purge] purged', {
        slug: tenant.slug,
        cleared: cleared.length,
        remaining,
      });
    } catch (err) {
      logger.error('[cron/tenant-purge] failed', {
        slug: tenant.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return res.status(200).json({ due: due.length, purged });
}
