// utils/adminIdempotency.ts
//
// Honor optionnel du header `Idempotency-Key` sur les mutations admin
// (POST/PATCH/PUT/DELETE). Pendant 5 min, deux requêtes avec la même
// (method, path, key, body) renvoient la même réponse en cache → un
// double-click admin / retry browser / partial-network n'exécute pas
// le travail deux fois.
//
// Pattern d'usage :
//
//   export default withStaffRoute(
//     withAdminIdempotency(handler, { key: 'auto-schedule' }),
//     'admin'
//   );
//
//   async function handler(req, res, ctx) { ... }
//
// Le wrapper s'insère APRÈS le check staff (donc le handler n'est jamais
// exécuté pour un user non authentifié), mais court-circuite le handler
// si une réponse cache est disponible.
//
// Le cache n'enregistre que les réponses 2xx : un 500 transitoire peut
// être retry sans renvoyer l'erreur précédente.
//
// Voir database/migrations/add_admin_idempotency_table.sql.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import type { AuthenticatedStaffContext } from './staff';

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_KEY_MAX_LEN = 200;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type CachedResponse = {
  status: number;
  body: unknown;
};

async function readCache(cacheKey: string): Promise<CachedResponse | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('admin_idempotency')
    .select('status, body, expires_at')
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  const exp = Date.parse(data.expires_at as string);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  return {
    status: data.status as number,
    body: data.body as unknown,
  };
}

async function writeCache(
  cacheKey: string,
  status: number,
  body: unknown
): Promise<void> {
  if (!supabaseAdmin) return;
  const expires_at = new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString();
  const { error } = await supabaseAdmin
    .from('admin_idempotency')
    .upsert(
      { cache_key: cacheKey, status, body, expires_at },
      { onConflict: 'cache_key' }
    );
  if (error) {
    // Best-effort : un échec de write = pire UX (retry refera le travail)
    // mais aucune corruption d'état.
    logger.error('[admin/idempotency] upsert error', error);
  }
}

function readKeyHeader(req: NextApiRequest): string | null {
  const raw = req.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > IDEMPOTENCY_KEY_MAX_LEN) {
    return null;
  }
  return trimmed;
}

function buildCacheKey(
  req: NextApiRequest,
  staffId: string,
  routeKey: string,
  userKey: string
): string {
  // Scope = staff_id + route + clé + hash du body. Le body hash protège
  // contre la réutilisation accidentelle de la même clé avec un payload
  // différent (ex: 2e auto-schedule avec params différents) — sinon on
  // replayerait silencieusement la première réponse.
  const bodyHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(req.body ?? null))
    .digest('hex')
    .slice(0, 8);
  return `${staffId} ${req.method ?? 'POST'} ${routeKey} ${userKey} ${bodyHash}`;
}

export type AdminIdempotencyOptions = {
  /** Identifiant unique de la route. Évite les collisions entre paths. */
  key: string;
};

export type StaffHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) => Promise<unknown>;

/**
 * Enveloppe un handler staff pour honorer l'`Idempotency-Key` header.
 * Ne fait rien si le header est absent : le handler s'exécute normalement.
 */
export function withAdminIdempotency(
  handler: StaffHandler,
  options: AdminIdempotencyOptions
): StaffHandler {
  return async (req, res, ctx): Promise<unknown> => {
    const method = (req.method ?? '').toUpperCase();

    // Pas d'idempotency sur les méthodes sûres (GET/HEAD) — pas de side
    // effects à dédoubler.
    if (SAFE_METHODS.has(method)) {
      return handler(req, res, ctx);
    }

    const userKey = readKeyHeader(req);
    if (!userKey) {
      // Header absent ou invalide : pas de cache, exécution normale.
      return handler(req, res, ctx);
    }

    const cacheKey = buildCacheKey(req, ctx.staff.id, options.key, userKey);
    const cached = await readCache(cacheKey);
    if (cached) {
      res.setHeader('Idempotency-Replay', 'true');
      res.status(cached.status).json(cached.body);
      return;
    }

    // Wrap res.json pour capturer status + body. Seuls les 2xx sont cachés
    // pour permettre le retry sur erreur transitoire (5xx). Le write est
    // fire-and-forget (un échec = retry refera le boulot).
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const status = res.statusCode || 200;
      if (status >= 200 && status < 300) {
        void writeCache(cacheKey, status, body).catch((e) =>
          logger.error('[admin/idempotency] async write error', e)
        );
      }
      return originalJson(body);
    }) as typeof res.json;

    return handler(req, res, ctx);
  };
}

/* ---------------------------------------------------------------------------
 * Test-only : clear the cache between scenarios.
 * ------------------------------------------------------------------------- */

export async function __resetAdminIdempotencyCache() {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from('admin_idempotency').delete().gt('id', 0);
}
