// pages/api/cron/blacklist-expiry.ts
//
// Levée des sanctions temporaires échues (blacklist joueurs et entités).
//
// Une entrée dont `expires_at` est passé est DÉJÀ inactive partout où la
// blacklist est vérifiée (prédicat central, utils/moderation/blacklistExpiry) :
// ce cron ne décide rien, il rend la levée VISIBLE (`active = false`, l'écran
// la range avec les entrées levées) et la JOURNALISE dans staff_logs — une
// action sans auteur staff (`staff_id` null, `payload.automatic`), pour que
// « qui a levé ce ban ? » ait toujours une réponse.
//
// Une seule ligne de journal par levée : l'écriture est conditionnelle
// (`active = true`), seules les lignes qu'elle a fait basculer sont tracées.
//
// Avant la migration `blacklist_expires_at`, la colonne manque : réponse 200
// `migration_pending` (rien à lever), pas une erreur qui alerterait chaque heure.
//
// Auth : `Authorization: Bearer <CRON_SECRET>` ou `?secret=<CRON_SECRET>`,
// comparé en temps constant. `?dry_run=1` compte sans écrire.

import crypto from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { logger } from '@/utils/logger';
import { isMissingColumnError } from '@/utils/moderation/missingColumn';
import { logStaffAction } from '@/utils/staffLogs';
import { supabaseAdmin } from '@/utils/supabase';

/** Plafond par passage et par table : le reste attend le passage suivant. */
const BATCH = 200;

type Table = 'player_blacklist' | 'entity_blacklist';

const ACTIONS = {
  player_blacklist: {
    action: 'blacklist_expired',
    entityType: 'blacklist',
  },
  entity_blacklist: {
    action: 'entity_blacklist_expired',
    entityType: 'entity_blacklist',
  },
} as const;

type ExpiredRow = { id: string; tenant_id: string; expires_at: string | null };

type TableResult = {
  candidates: number;
  expired: number;
  error?: 'lookup_failed' | 'update_failed' | 'migration_pending';
};

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/blacklist-expiry] CRON_SECRET absent — refus');
    return false;
  }
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    if (sameSecret(header.slice('Bearer '.length), secret)) return true;
  }
  const q = req.query.secret;
  return typeof q === 'string' && sameSecret(q, secret);
}

// Les colonnes `expires_at` sont hors du schéma généré tant que la migration
// n'est pas reflétée dans les types : client non typé pour ce balayage.
function table(name: Table) {
  return (supabaseAdmin as unknown as { from: (t: string) => any }).from(name);
}

export async function expireTable(
  name: Table,
  now: Date,
  dryRun: boolean
): Promise<TableResult> {
  const nowIso = now.toISOString();
  const { data, error } = await table(name)
    .select('id, tenant_id, expires_at')
    .eq('active', true)
    .lte('expires_at', nowIso)
    .order('expires_at', { ascending: true })
    .limit(BATCH);
  if (error) {
    if (isMissingColumnError(error, 'expires_at')) {
      return { candidates: 0, expired: 0, error: 'migration_pending' };
    }
    logger.error('[cron/blacklist-expiry] %s lookup error', name, error);
    return { candidates: 0, expired: 0, error: 'lookup_failed' };
  }
  const rows = ((data ?? []) as ExpiredRow[]).filter((r) => r.expires_at);
  if (dryRun || rows.length === 0) {
    return { candidates: rows.length, expired: 0 };
  }

  // Conditionnelle : une entrée levée à la main entre-temps n'est ni
  // re-basculée ni journalisée deux fois.
  const { data: flipped, error: updateError } = await table(name)
    .update({ active: false, updated_at: nowIso })
    .in(
      'id',
      rows.map((r) => r.id)
    )
    .eq('active', true)
    .lte('expires_at', nowIso)
    .select('id, tenant_id, expires_at');
  if (updateError) {
    logger.error('[cron/blacklist-expiry] %s update error', name, updateError);
    return { candidates: rows.length, expired: 0, error: 'update_failed' };
  }

  const done = (flipped ?? []) as ExpiredRow[];
  const { action, entityType } = ACTIONS[name];
  await Promise.all(
    done.map((row) =>
      logStaffAction({
        staff_id: null,
        action,
        entity_type: entityType,
        entity_id: row.id,
        tenant_id: row.tenant_id,
        payload: { automatic: true, expires_at: row.expires_at },
      }).catch((err) => logger.warn('[cron/blacklist-expiry] log error', err))
    )
  );
  return { candidates: rows.length, expired: done.length };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
  const now = new Date();
  // Tous espaces confondus : chaque levée est journalisée dans SON espace.
  const players = await expireTable('player_blacklist', now, dryRun);
  const entities = await expireTable('entity_blacklist', now, dryRun);

  logger.info(
    '[cron/blacklist-expiry] joueurs=%d/%d entités=%d/%d',
    players.expired,
    players.candidates,
    entities.expired,
    entities.candidates
  );
  return res.status(200).json({ players, entities, dry_run: dryRun });
}
