// utils/apiHelpers.ts
// Shared helpers for admin API routes to reduce boilerplate

import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Extract and validate a single string query parameter.
 * Returns the string value or null if invalid (missing or array).
 */
export function getQueryParam(
  req: NextApiRequest,
  key: string
): string | null {
  const val = req.query[key];
  if (!val || Array.isArray(val)) return null;
  return String(val);
}

/**
 * Extract and validate a required single string query parameter.
 * Sends a 400 response and returns null if invalid.
 */
export function requireQueryParam(
  req: NextApiRequest,
  res: NextApiResponse,
  key: string
): string | null {
  const val = getQueryParam(req, key);
  if (!val) {
    res.status(400).json({ error: `Invalid ${key}` });
    return null;
  }
  return val;
}

/**
 * Filter request body to only include allowed fields.
 * Returns the filtered payload or null if no valid fields found (sends 400).
 */
export function filterAllowedFields<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
  allowedFields: readonly string[],
  res?: NextApiResponse
): Partial<T> | null {
  const payload: Record<string, unknown> = {};

  for (const key of allowedFields) {
    if (key in body) {
      payload[key] = body[key];
    }
  }

  if (Object.keys(payload).length === 0) {
    if (res) {
      res.status(400).json({
        error: `No valid fields to update. Allowed: ${allowedFields.join(', ')}`,
      });
    }
    return null;
  }

  return payload as Partial<T>;
}

/**
 * Check if hard delete was requested via query parameter.
 */
export function isHardDelete(req: NextApiRequest): boolean {
  return req.query.hard === '1' || req.query.hard === 'true';
}

/**
 * Route requests by HTTP method. Reduces switch/case boilerplate.
 *
 * Usage:
 * ```ts
 * return methodRouter(req, res, {
 *   GET: () => handleGet(id, res),
 *   PUT: () => handlePut(id, req, res, ctx),
 *   DELETE: () => handleDelete(id, req, res, ctx),
 * });
 * ```
 */
export function methodRouter(
  req: NextApiRequest,
  res: NextApiResponse,
  handlers: Partial<Record<string, () => Promise<void | NextApiResponse>>>
): Promise<void | NextApiResponse> {
  const method = req.method ?? '';

  // Support PUT/PATCH aliases
  const handler =
    handlers[method] ??
    (method === 'PATCH' ? handlers['PUT'] : undefined);

  if (!handler) {
    return Promise.resolve(
      res.status(405).json({ error: 'Method not allowed' })
    );
  }

  return handler();
}

/**
 * Wrap a handler with standard try/catch error handling.
 */
export function withErrorHandler(
  routeName: string,
  fn: () => Promise<void | NextApiResponse>,
  res: NextApiResponse
): Promise<void | NextApiResponse> {
  return fn().catch((err: any) => {
    console.error(`[${routeName}] internal error:`, err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  });
}
