// utils/publicApi.ts
//
// Shared middleware + response envelope for the versioned PUBLIC read-only API
// under `/api/public/v1/*` (start.gg-style: caster overlays, partner widgets,
// embeds).
//
// ─────────────────────────────────────────────────────────────────────────────
// SÉCURITÉ / POSTURE — "public GET, anonyme, CORS ouvert" (VOLONTAIRE).
//
// Ces endpoints sont read-only stricts, non authentifiés et servis avec
// `Access-Control-Allow-Origin: *` pour être consommables depuis n'importe
// quel front (overlays OBS, widgets partenaires, embeds tiers). Ce n'est pas
// un leak : chaque handler PROJETTE explicitement un sous-ensemble de colonnes
// déjà publiques sur le site (noms d'équipes, scores, dates, ratings publics).
// On n'expose JAMAIS email / tokens / IDs Discord privés / notes internes.
//
// Le tenant est résolu comme les autres endpoints publics
// (`resolveTenantIdForPublicRequest` → `DEFAULT_TENANT_ID` en V1 mono-tenant).
//
// Contraintes appliquées par `withPublicApi` :
//   - Méthodes : GET + OPTIONS uniquement. OPTIONS (preflight CORS) → 204 avec
//     les headers CORS. Toute autre méthode → 405 + `Allow: GET, OPTIONS`.
//   - Rate-limit IP par endpoint (bucket dédié, défaut 120 req/min).
//   - Headers CORS sur toutes les réponses (`*`, `GET, OPTIONS`,
//     `Content-Type`).
//   - `Cache-Control: public, s-maxage=<cacheSeconds>, stale-while-revalidate`.
//   - Enveloppe de réponse cohérente (`{ data }` / `{ data, pagination }` /
//     `{ error, code? }`).
// ─────────────────────────────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from './rateLimit';
import { consumeDurableRateLimit, clientKeyFromReq } from './durableRateLimit';
import { logger } from './logger';

/** Standard error codes surfaced by the public API. */
export type PublicApiErrorCode =
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'METHOD_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

/** Pagination block returned alongside list responses. */
export type PublicApiPagination = {
  limit: number;
  offset: number;
  count: number;
};

export type PublicApiListEnvelope<T> = {
  data: T[];
  pagination?: PublicApiPagination;
};

export type PublicApiSingleEnvelope<T> = {
  data: T;
};

export type PublicApiErrorEnvelope = {
  error: string;
  code?: PublicApiErrorCode;
};

/** Options accepted by `withPublicApi`. */
export type WithPublicApiOptions = {
  /**
   * Rate-limit store name — one bucket per endpoint so a hot endpoint can't
   * starve the others. Convention: `public-v1-<resource>`.
   */
  rateLimitBucket: string;
  /** Max requests per IP per minute for this endpoint. Default 120. */
  maxPerMin?: number;
  /**
   * `s-maxage` seconds for the `Cache-Control` header. `stale-while-revalidate`
   * is derived as `Math.ceil(cacheSeconds / 2)`. Default 60.
   */
  cacheSeconds?: number;
};

/**
 * Rich context handed to a public handler. `res` is intentionally NOT passed —
 * handlers return a plain body (or throw a `PublicApiError`) and the wrapper
 * owns status codes, envelope shaping and headers. This keeps handlers thin,
 * pure-ish and trivially unit-testable.
 */
export type PublicApiContext = {
  req: NextApiRequest;
  res: NextApiResponse;
};

/**
 * Error a handler can throw to short-circuit with a specific status + code.
 * The wrapper catches it and emits the standard `{ error, code }` envelope.
 */
export class PublicApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: PublicApiErrorCode
  ) {
    super(message);
    this.name = 'PublicApiError';
  }

  static notFound(message = 'Not found'): PublicApiError {
    return new PublicApiError(404, message, 'NOT_FOUND');
  }

  static badRequest(message = 'Bad request'): PublicApiError {
    return new PublicApiError(400, message, 'BAD_REQUEST');
  }
}

/**
 * A handler either returns a list result `{ items, count? }` (→ list envelope
 * with pagination) or a single value (→ single envelope). Distinguish the two
 * by the discriminant `kind`.
 */
export type PublicListResult<T> = {
  kind: 'list';
  items: T[];
  /** Total count for pagination (defaults to items.length when omitted). */
  count?: number;
  limit?: number;
  offset?: number;
};

export type PublicSingleResult<T> = {
  kind: 'single';
  value: T;
};

export type PublicHandlerResult<T> =
  | PublicListResult<T>
  | PublicSingleResult<T>;

/** Convenience builders so handlers stay declarative. */
export function list<T>(
  items: T[],
  opts?: { count?: number; limit?: number; offset?: number }
): PublicListResult<T> {
  return { kind: 'list', items, ...opts };
}

export function single<T>(value: T): PublicSingleResult<T> {
  return { kind: 'single', value };
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function setCorsHeaders(res: NextApiResponse): void {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
}

/**
 * Wrap a public read-only handler with method guard (GET/OPTIONS), CORS
 * (preflight OPTIONS → 204), per-endpoint IP rate-limit, `Cache-Control`, and
 * a consistent response envelope.
 *
 * The handler receives `{ req, res }` and returns either `list(...)` or
 * `single(...)`. It may `throw PublicApiError.notFound()` /
 * `PublicApiError.badRequest()` to short-circuit. Any other thrown error →
 * 500 with a generic message (details logged server-side).
 *
 * Signature:
 *   withPublicApi(handler, { rateLimitBucket, maxPerMin?, cacheSeconds? })
 */
export function withPublicApi<T>(
  handler: (ctx: PublicApiContext) => Promise<PublicHandlerResult<T>>,
  opts: WithPublicApiOptions
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
  const maxPerMin = opts.maxPerMin ?? 120;
  const cacheSeconds = opts.cacheSeconds ?? 60;
  const swr = Math.max(1, Math.ceil(cacheSeconds / 2));

  return async function publicApiRoute(
    req: NextApiRequest,
    res: NextApiResponse
  ): Promise<void> {
    // CORS on every response (including errors + preflight).
    setCorsHeaders(res);

    // Preflight — respond immediately, no body.
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      const body: PublicApiErrorEnvelope = {
        error: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED',
      };
      res.status(405).json(body);
      return;
    }

    // L1 — rate-limit en mémoire par endpoint (fail-fast, sans DB).
    // `applyRateLimit` émet son propre body 429 + Retry-After ; on stoppe ici.
    if (
      applyRateLimit(
        req,
        res,
        { max: maxPerMin, windowMs: 60_000 },
        opts.rateLimitBucket
      )
    ) {
      return;
    }

    // L2 — rate-limit DURABLE (cross-instance) adossé à Postgres. Le Map L1 est
    // per-process : en multi-instance Netlify il laisse passer N×maxPerMin. Ce
    // second passage partage le compteur entre toutes les instances. FAIL-OPEN :
    // si le RPC erre/absent, `consumeDurableRateLimit` autorise (ne casse jamais
    // le chemin public). Acceptable en perf car ces endpoints sont cachés à
    // l'edge (s-maxage) → l'origine est rarement touchée.
    const durableBucket = `publicv1:${opts.rateLimitBucket}:${clientKeyFromReq(req)}`;
    const durableAllowed = await consumeDurableRateLimit(
      durableBucket,
      60,
      maxPerMin
    );
    if (!durableAllowed) {
      res.setHeader('Retry-After', '60');
      const body: PublicApiErrorEnvelope = {
        error: 'Trop de requêtes. Réessayez plus tard.',
        code: 'RATE_LIMITED',
      };
      res.status(429).json(body);
      return;
    }

    try {
      const result = await handler({ req, res });

      res.setHeader(
        'Cache-Control',
        `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${swr}`
      );

      if (result.kind === 'single') {
        const body: PublicApiSingleEnvelope<T> = { data: result.value };
        res.status(200).json(body);
        return;
      }

      // list
      const limit = result.limit;
      const offset = result.offset;
      const body: PublicApiListEnvelope<T> = { data: result.items };
      if (typeof limit === 'number' && typeof offset === 'number') {
        body.pagination = {
          limit,
          offset,
          count: result.count ?? result.items.length,
        };
      }
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof PublicApiError) {
        const body: PublicApiErrorEnvelope = { error: err.message };
        if (err.code) body.code = err.code;
        res.status(err.status).json(body);
        return;
      }
      logger.error(`[public/v1] ${opts.rateLimitBucket} handler error`, err);
      const body: PublicApiErrorEnvelope = {
        error: 'Internal server error',
        code: 'INTERNAL',
      };
      res.status(500).json(body);
    }
  };
}

/** Extract the first value of a `string | string[] | undefined` query param. */
export function firstQuery(
  value: string | string[] | undefined
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
