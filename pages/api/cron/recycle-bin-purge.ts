// pages/api/cron/recycle-bin-purge.ts
//
// Fonction planifiée (Netlify, via netlify/functions/recycle-bin-purge-cron.ts,
// une fois par jour) qui vide la corbeille admin de ce qui y dort depuis plus
// de PURGE_RETENTION_DAYS (90 jours, features/admin/recycle-bin/schemas.ts).
//
// POURQUOI. Rien ne vidait la corbeille : un adhérent ou un partenaire
// supprimé y gardait ses données personnelles pour toujours. Seuls les
// PURGEABLE_TYPES sont concernés ; l'historique des tournois (équipes,
// matchs, phases, scrims), les comptes staff et les casteurs ne sont jamais
// effacés ici (exclusions documentées dans schemas.ts). Un adhérent qui a
// des cotisations est anonymisé, pas supprimé (pièces comptables).
//
// Chaque effacement est journalisé dans staff_logs (`purge_deleted_item`,
// `payload.automatic: true`). Lots de PURGE_BATCH_PER_TYPE par type et par
// passage : le reste part le lendemain.
//
// Auth : `Authorization: Bearer <CRON_SECRET>` ou `?secret=<CRON_SECRET>`,
// comme les autres endpoints /api/cron/*, comparé en temps constant.

import crypto from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { runRecycleBinPurge } from '@/features/admin/recycle-bin/purge';

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/recycle-bin-purge] CRON_SECRET absent — refus');
    return false;
  }
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    if (sameSecret(header.slice('Bearer '.length), secret)) return true;
  }
  const q = req.query.secret;
  return typeof q === 'string' && sameSecret(q, secret);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST,GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const started = Date.now();
  try {
    const report = await runRecycleBinPurge(
      supabaseAdmin as unknown as SupabaseClient
    );
    const durationMs = Date.now() - started;
    const totals = Object.values(report.types).reduce(
      (acc, t) => ({
        deleted: acc.deleted + (t?.deleted ?? 0),
        anonymized: acc.anonymized + (t?.anonymized ?? 0),
        failed: acc.failed + (t?.failed ?? 0) + (t?.error ? 1 : 0),
      }),
      { deleted: 0, anonymized: 0, failed: 0 }
    );
    const log = totals.failed > 0 ? logger.warn : logger.info;
    log(
      '[cron/recycle-bin-purge] cutoff=%s deleted=%d anonymized=%d failed=%d duration_ms=%d',
      report.cutoff,
      totals.deleted,
      totals.anonymized,
      totals.failed,
      durationMs
    );
    return res.status(200).json({ ...report, duration_ms: durationMs });
  } catch (err) {
    logger.error('[cron/recycle-bin-purge] unexpected error', err);
    return res.status(500).json({ error: 'Purge failed' });
  }
}
