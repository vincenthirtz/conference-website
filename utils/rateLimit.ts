import type { NextApiRequest, NextApiResponse } from 'next';

type RateLimitConfig = {
  /** Max requests allowed in the time window */
  max: number;
  /** Time window in milliseconds */
  windowMs: number;
};

const DEFAULT_CONFIG: RateLimitConfig = {
  max: 30,
  windowMs: 60 * 1000, // 1 minute
};

const stores = new Map<string, Map<string, number[]>>();

function getStore(name: string): Map<string, number[]> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

const IP_RE = /^[\d.a-fA-F:]+$/;

export function getClientIp(req: NextApiRequest): string {
  // Prefer headers set by trusted reverse proxies (Netlify, Cloudflare)
  const cfIp = req.headers['cf-connecting-ip'];
  const realIp = req.headers['x-real-ip'];
  const forwarded = req.headers['x-forwarded-for'];

  // Pick the most trustworthy header available, then fall back to socket
  const raw =
    (typeof cfIp === 'string' ? cfIp : undefined) ||
    (typeof realIp === 'string' ? realIp : undefined) ||
    (typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : undefined) ||
    req.socket.remoteAddress ||
    'unknown';

  // Basic format validation to reject obviously spoofed values
  return IP_RE.test(raw) ? raw : 'unknown';
}

/**
 * Rate limit check. Returns true if the request should be blocked.
 *
 * Usage in an API handler:
 *   if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 })) return;
 */
export function applyRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  config?: Partial<RateLimitConfig>,
  storeName = 'default'
): boolean {
  const { max, windowMs } = { ...DEFAULT_CONFIG, ...config };
  const store = getStore(storeName);
  const ip = getClientIp(req);
  const now = Date.now();

  const timestamps = (store.get(ip) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= max) {
    res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
    res.status(429).json({
      error: 'Trop de requêtes. Réessayez plus tard.',
    });
    return true;
  }

  timestamps.push(now);
  store.set(ip, timestamps);

  // Prevent unbounded memory growth: evict stale entries when store grows too large
  const MAX_STORE_SIZE = 10_000;
  if (store.size > MAX_STORE_SIZE) {
    for (const [key, ts] of store) {
      // Remove entries with no recent timestamps
      const fresh = ts.filter((t) => now - t < windowMs);
      if (fresh.length === 0) {
        store.delete(key);
      } else {
        store.set(key, fresh);
      }
      // Stop cleanup once we're back under limit
      if (store.size <= MAX_STORE_SIZE * 0.8) break;
    }
  }

  return false;
}

/**
 * Per-actor rate limit. Keyed on an arbitrary string (typically a Discord
 * user id) rather than the request IP. Useful in /api/bot/v1/* where every
 * request comes from the bot's IP — a per-IP cap would treat all users as
 * one bucket. Pair with applyRateLimit for combined IP + actor limits.
 *
 * Returns true if the request should be blocked.
 */
export function applyActorRateLimit(
  res: NextApiResponse,
  actorKey: string,
  config: RateLimitConfig,
  storeName: string
): boolean {
  if (!actorKey) return false;
  const store = getStore(`${storeName}:actor`);
  const now = Date.now();
  const timestamps = (store.get(actorKey) ?? []).filter(
    (t) => now - t < config.windowMs
  );
  if (timestamps.length >= config.max) {
    res.setHeader('Retry-After', String(Math.ceil(config.windowMs / 1000)));
    res.status(429).json({
      error: 'Trop de requêtes pour ton compte. Réessaye plus tard.',
      code: 'ACTOR_RATE_LIMIT',
    });
    return true;
  }
  timestamps.push(now);
  store.set(actorKey, timestamps);
  return false;
}
