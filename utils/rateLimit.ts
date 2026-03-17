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

export function getClientIp(req: NextApiRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
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

  const timestamps = (store.get(ip) ?? []).filter(
    (t) => now - t < windowMs
  );

  if (timestamps.length >= max) {
    res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
    res.status(429).json({
      error: 'Trop de requêtes. Réessayez plus tard.',
    });
    return true;
  }

  timestamps.push(now);
  store.set(ip, timestamps);
  return false;
}
