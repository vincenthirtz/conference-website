// utils/botAuth.ts
//
// Bot <-> site shared API key verification + a `withBotRoute` middleware that
// bundles the boilerplate every /api/bot/v1/* route used to duplicate:
//   - method gate (405)
//   - rate limit (429)
//   - BOT_API_KEY presence + constant-time compare (401/500)
//   - supabaseAdmin availability (500)
//   - optional Idempotency-Key honoring (replays cached response)
//
// The idempotency cache is in-memory, ~5 min TTL. Acceptable trade-off given
// Netlify currently runs as a single Lambda instance per region and the bot's
// retry-after-timeout window is short. If we move to multi-instance, swap the
// cache for a Supabase table without touching call sites.

import crypto from 'crypto';
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from './rateLimit';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';

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
 * Idempotency cache (in-memory)
 * ------------------------------------------------------------------------- */

type CachedResponse = {
  status: number;
  body: unknown;
  expiresAt: number;
};

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 1000;
const IDEMPOTENCY_KEY_MAX_LEN = 200;

const idempotencyCache = new Map<string, CachedResponse>();

function pruneIdempotencyCache(now: number) {
  for (const [k, v] of idempotencyCache) {
    if (v.expiresAt <= now) idempotencyCache.delete(k);
  }
  if (idempotencyCache.size > IDEMPOTENCY_MAX_ENTRIES) {
    // Map preserves insertion order; drop the oldest until back under cap.
    const overflow = idempotencyCache.size - IDEMPOTENCY_MAX_ENTRIES;
    let i = 0;
    for (const k of idempotencyCache.keys()) {
      if (i++ >= overflow) break;
      idempotencyCache.delete(k);
    }
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
  // Scope by method + path so the same Idempotency-Key on a different endpoint
  // doesn't collide (RFC-style scoping).
  return `${req.method ?? 'POST'} ${req.url ?? ''} ${key}`;
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
  };
  /**
   * Honor `Idempotency-Key` request header on non-GET methods. Cached responses
   * are replayed for 5 min; the cache is keyed by method+path+key so the same
   * key on a different route doesn't collide.
   */
  idempotent?: boolean;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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

    // Idempotency: only honored for unsafe methods.
    if (options.idempotent && !SAFE_METHODS.has(method)) {
      const userKey = readIdempotencyKey(req);
      if (userKey) {
        const now = Date.now();
        pruneIdempotencyCache(now);
        const cacheKey = idempotencyCacheKey(req, userKey);
        const cached = idempotencyCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
          res.setHeader('Idempotency-Replay', 'true');
          return res.status(cached.status).json(cached.body);
        }

        // Wrap res.json so we capture the *eventual* status + body to replay.
        // Only cache success responses (2xx) so a transient 500 can be retried.
        const originalJson = res.json.bind(res);
        res.json = ((body: unknown) => {
          const status = res.statusCode || 200;
          if (status >= 200 && status < 300) {
            idempotencyCache.set(cacheKey, {
              status,
              body,
              expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
            });
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

export function __resetBotIdempotencyCache() {
  idempotencyCache.clear();
}
