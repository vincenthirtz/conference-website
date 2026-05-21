// utils/botAuth.ts
//
// Bot <-> site shared API key verification + a `withBotRoute` middleware that
// bundles the boilerplate every /api/bot/v1/* route used to duplicate:
//   - method gate (405)
//   - rate limit (429)
//   - BOT_API_KEY presence + constant-time compare (401/500)
//   - supabaseAdmin availability (500)
//   - maintenance mode gate (503)
//   - optional Idempotency-Key honoring (replays cached response)
//
// Idempotency cache : persiste dans la table Supabase `bot_idempotency`
// (TTL 5min cote app). Survit aux cold starts et est partage entre Lambdas
// si Netlify scale. Voir database/migrations/add_bot_idempotency_table.sql.

import crypto from 'crypto';
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { applyActorRateLimit, applyRateLimit } from './rateLimit';
import { supabaseAdmin } from './supabase';
import { isBotMaintenanceMode } from './maintenance';
import { logger } from './logger';
import { resolveTenantId } from './tenant';

export function verifyBotApiKey(req: NextApiRequest): boolean {
  const expected = process.env.BOT_API_KEY;
  if (!expected) return false;
  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ---------------------------------------------------------------------------
 * Idempotency cache (Supabase-backed)
 * ------------------------------------------------------------------------- */

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_KEY_MAX_LEN = 200;

type CachedResponse = {
  status: number;
  body: unknown;
};

async function readIdempotencyCache(
  cacheKey: string,
  tenantId: string
): Promise<CachedResponse | null> {
  if (!supabaseAdmin) return null;
  // Multi-tenant scoping (S3 / Phase 1c) : on filtre par tenant_id pour
  // que deux tenants utilisant la meme Idempotency-Key (collision plausible
  // sur des keys courtes type UUIDv4 tronques) n'entrent pas en collision
  // de cache. La contrainte UNIQUE(tenant_id, cache_key) garantit l'unicite
  // au niveau DB.
  const { data, error } = await supabaseAdmin
    .from('bot_idempotency')
    .select('status, body, expires_at')
    .eq('tenant_id', tenantId)
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

async function writeIdempotencyCache(
  cacheKey: string,
  status: number,
  body: unknown,
  tenantId: string
): Promise<void> {
  if (!supabaseAdmin) return;
  const expires_at = new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString();
  // Upsert : remplace une row potentiellement expiree avec la meme cle.
  // On stocke tenant_id pour le scope multi-tenant.
  const { error } = await supabaseAdmin
    .from('bot_idempotency')
    .upsert(
      { cache_key: cacheKey, status, body, expires_at, tenant_id: tenantId },
      { onConflict: 'tenant_id,cache_key' }
    );
  if (error) {
    // On log mais on ne bloque pas : echec d'ecriture cache = pire UX
    // (le retry refera le travail) mais pas de corruption.
    logger.error('[bot/idempotency] upsert error', error);
  }
}

function readIdempotencyKey(req: NextApiRequest): string | null {
  const raw = req.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > IDEMPOTENCY_KEY_MAX_LEN)
    return null;
  return trimmed;
}

function idempotencyCacheKey(req: NextApiRequest, key: string): string {
  // Scope by method + path + body. The body hash protects against the bot
  // reusing the same Idempotency-Key with a different payload (e.g. corrected
  // score) and silently replaying the previous response — that would lose
  // data without surfacing an error. Different body → different cache key
  // → request is processed normally.
  const bodyHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(req.body ?? null))
    .digest('hex')
    .slice(0, 8);
  return `${req.method ?? 'POST'} ${req.url ?? ''} ${key} ${bodyHash}`;
}

/* ---------------------------------------------------------------------------
 * withBotRoute middleware
 * ------------------------------------------------------------------------- */

export type BotRouteOptions = {
  /** Allowed HTTP methods. Anything else → 405 + Allow header. */
  methods: readonly string[];
  /** Rate limit config. Reuses utils/rateLimit. */
  rateLimit: {
    max: number;
    windowMs?: number;
    /** Unique store name so each route has its own bucket. */
    key: string;
    /**
     * Optional per-actor sub-limit. Read body.actorDiscordUserId at request
     * time. If present, applies an extra cap keyed on the actor — useful so
     * one Discord user spamming /forfait doesn't drain the global IP bucket
     * for everyone. Pair with the global max for combined protection.
     */
    perActor?: {
      max: number;
      windowMs?: number;
    };
  };
  /**
   * Honor `Idempotency-Key` request header on non-GET methods. Cached responses
   * are replayed for 5 min; the cache is keyed by method+path+key so the same
   * key on a different route doesn't collide.
   */
  idempotent?: boolean;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DISCORD_ID_RE = /^[0-9]{15,25}$/;

export function withBotRoute(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse
  ) => unknown | Promise<unknown>,
  options: BotRouteOptions
): NextApiHandler {
  const allowed = new Set(options.methods.map((m) => m.toUpperCase()));
  const allowHeader = options.methods.join(',');

  return async (req, res) => {
    const method = (req.method ?? '').toUpperCase();
    if (!allowed.has(method)) {
      res.setHeader('Allow', allowHeader);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (
      applyRateLimit(
        req,
        res,
        {
          max: options.rateLimit.max,
          windowMs: options.rateLimit.windowMs ?? 60_000,
        },
        options.rateLimit.key
      )
    ) {
      return;
    }

    if (!process.env.BOT_API_KEY) {
      logger.error(`[bot/${options.rateLimit.key}] BOT_API_KEY is unset`);
      return res.status(500).json({ error: 'Endpoint not configured.' });
    }
    if (!verifyBotApiKey(req)) {
      return res.status(401).json({ error: 'Invalid or missing API key.' });
    }
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database unavailable.' });
    }

    // Multi-tenant plumbing (Phase 1 / S2) : on resout l'identite du tenant
    // pour ce call (x-tenant-id header) et on l'attache au contexte pour
    // que les handlers (sweep S3-S4) puissent scoper leurs requetes avec
    // .eq('tenant_id', tenantId). Pas de validation contre la table
    // `tenants` ici — c'est juste un passe-plat (la validation arrive en
    // Phase 3 / S6). Header absent ou malforme → fallback
    // DEFAULT_TENANT_ID (utils/tenant.ts).
    req.botContext = {
      ...(req.botContext ?? {}),
      tenantId: resolveTenantId(req),
    };

    // Maintenance mode : si actif, on bloque tous les writes (POST/PATCH/
    // DELETE/PUT). Les GET continuent de fonctionner pour ne pas casser
    // le polling reminders / snapshot pendant un deploiement.
    if (!SAFE_METHODS.has(method)) {
      if (await isBotMaintenanceMode()) {
        res.setHeader('Retry-After', '60');
        return res.status(503).json({
          error:
            'Site en maintenance, les écritures bot sont temporairement désactivées.',
          code: 'MAINTENANCE_MODE',
        });
      }
    }

    // Per-actor rate limit : on lit actorDiscordUserId dans le body OU la
    // query si fourni en options. Compatible avec les routes qui lisent
    // l'acteur en query (GET) et celles qui le lisent en body (POST/PATCH).
    if (options.rateLimit.perActor) {
      const actorFromBody =
        typeof (req.body as Record<string, unknown> | null)
          ?.actorDiscordUserId === 'string'
          ? (
              (req.body as Record<string, unknown>).actorDiscordUserId as string
            ).trim()
          : '';
      const actorFromQuery =
        typeof req.query.actorDiscordUserId === 'string'
          ? req.query.actorDiscordUserId.trim()
          : '';
      const actorKey = actorFromBody || actorFromQuery;
      if (actorKey && DISCORD_ID_RE.test(actorKey)) {
        if (
          applyActorRateLimit(
            res,
            actorKey,
            {
              max: options.rateLimit.perActor.max,
              windowMs: options.rateLimit.perActor.windowMs ?? 60_000,
            },
            options.rateLimit.key
          )
        ) {
          return;
        }
      }
    }

    // Idempotency: only honored for unsafe methods.
    if (options.idempotent && !SAFE_METHODS.has(method)) {
      const userKey = readIdempotencyKey(req);
      if (userKey) {
        const cacheKey = idempotencyCacheKey(req, userKey);
        // Scope cache lookup + write par tenant (S3 / Phase 1c) — pas de leak
        // si deux tenants utilisent par hasard la meme Idempotency-Key.
        const tenantIdForCache = req.botContext!.tenantId;
        const cached = await readIdempotencyCache(cacheKey, tenantIdForCache);
        if (cached) {
          res.setHeader('Idempotency-Replay', 'true');
          return res.status(cached.status).json(cached.body);
        }

        // Wrap res.json so we capture the *eventual* status + body to replay.
        // Only cache success responses (2xx) so a transient 500 can be retried.
        // Write is fire-and-forget : si elle echoue on a juste un retry qui
        // refera le travail, pas de corruption.
        const originalJson = res.json.bind(res);
        res.json = ((body: unknown) => {
          const status = res.statusCode || 200;
          if (status >= 200 && status < 300) {
            void writeIdempotencyCache(
              cacheKey,
              status,
              body,
              tenantIdForCache
            ).catch((e) =>
              logger.error('[bot/idempotency] async write error', e)
            );
          }
          return originalJson(body);
        }) as typeof res.json;
      }
    }

    try {
      return await handler(req, res);
    } catch (e) {
      logger.error(`[bot/${options.rateLimit.key}] unhandled error`, e);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Internal error' });
      }
    }
  };
}

/* ---------------------------------------------------------------------------
 * Test-only: clear the cache between scenarios.
 * ------------------------------------------------------------------------- */

export async function __resetBotIdempotencyCache() {
  if (!supabaseAdmin) return;
  // Truncate-like cleanup pour les tests : delete sur une condition toujours
  // vraie (delete().neq('id', 0) etc.). On utilise gt('id', 0) — toutes les
  // rows ont id >= 1 (BIGSERIAL).
  await supabaseAdmin.from('bot_idempotency').delete().gt('id', 0);
}
