// utils/publicWriteApi.ts
//
// Middleware d'ÉCRITURE pour l'API publique authentifiée (`/api/public/v1/*`
// en POST/PATCH/DELETE + mutations GraphQL). Frère de `utils/publicApi.ts`
// (read-only anonyme) — mais posture opposée : ici on EXIGE un token scopé.
//
// ─────────────────────────────────────────────────────────────────────────────
// AUTH — token API scopé, DÉCOUPLÉ du bot Discord.
//
// Le client envoie `Authorization: Bearer pk_live_<…>`. Le token est sha256-
// hashé et cherché dans `tenant_api_tokens` (non révoqué). Sur match : le
// tenant est AUTORITAIRE (comme la clé bot per-tenant) et les `scopes` de la
// row gouvernent ce que le token peut faire. Un endpoint déclare le scope qu'il
// exige (`scope: 'matches:write'`) ; sans lui → 403 INSUFFICIENT_SCOPE.
//
// Réutilise, pièce par pièce, la machinerie déjà éprouvée du bot :
//   - method gate (405), rate-limit IP (429) + rate-limit par TOKEN,
//   - maintenance gate sur les writes (503),
//   - validation zod body/query (400),
//   - idempotency Idempotency-Key (table Supabase `bot_idempotency`, clés
//     préfixées `pub:` + scopées par tenant — pas de collision avec le bot),
//   - enveloppe d'erreur cohérente `{ error, code }`.
//
// POSTURE CORS : PAS de `Access-Control-Allow-Origin: *`. L'écriture n'est pas
// un widget anonyme — usage server-to-server (scripts d'orga). Un appel
// cross-origin navigateur échoue au preflight, volontairement.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { ZodType } from 'zod';
import { supabaseAdmin } from './supabase';
import { applyRateLimit, applyActorRateLimit } from './rateLimit';
import { isBotMaintenanceMode } from './maintenance';
import { logger } from './logger';
import { formatZodError } from './validation';
import { hasScope, type ApiScope } from './apiScopes';
import {
  apiActionForMethod,
  checkApiTokenAccess,
  type ApiPlanDenial,
} from './billing/apiPlanGate';
import type {
  TenantPlan,
  PlanStatus,
  TenantPlanState,
} from './billing/planFeatures';

/** Codes d'erreur normalisés surfacés par l'API publique d'écriture. */
export type PublicWriteErrorCode =
  | 'UNAUTHORIZED'
  | 'INSUFFICIENT_SCOPE'
  | 'METHOD_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'MAINTENANCE_MODE'
  | 'INVALID_BODY'
  | 'INVALID_QUERY'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL';

/** Identité résolue d'un token API public. */
export type PublicApiToken = {
  id: string;
  tenantId: string;
  scopes: string[];
  /**
   * État plan du tenant propriétaire du token, chargé au moment de la
   * résolution. Consommé par le gate PLAN (`checkApiTokenAccess`) : l'accès API
   * (lecture/écriture) est un produit payant. `foundation` a tout ; un tenant
   * `discovery` ou un plan payant expiré est refusé (403 `plan_required`).
   */
  plan: TenantPlanState;
  /**
   * Exemption partenaire (`tenant_api_tokens.comp`). `true` → cette clé bypasse
   * ENTIÈREMENT le gate de plan (accès gratuit en lecture ET écriture, quel que
   * soit le plan du tenant). Posé par l'opérateur plateforme.
   */
  comp: boolean;
};

/**
 * État plan par défaut quand la row `tenants` est introuvable / dépourvue des
 * colonnes de plan. Fail-closed sur le palier gratuit `discovery` (ni apiRead
 * ni apiWrite) : un token dont on ne peut pas prouver l'entitlement ne doit pas
 * ouvrir un accès payant. En pratique la FK garantit une row `tenants`, et la
 * migration billing garantit les colonnes → ce fallback ne mord que sur un état
 * de données corrompu.
 */
const FALLBACK_PLAN_STATE: TenantPlanState = {
  plan: 'discovery',
  plan_status: 'active',
  plan_expires_at: null,
};

const BEARER_PREFIX = 'Bearer ';
const TOKEN_PLAIN_PREFIX = 'pk_live_';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Erreur qu'un handler peut throw pour court-circuiter avec un status + code
 * précis. Le wrapper la catch et émet `{ error, code }`.
 */
export class PublicWriteError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: PublicWriteErrorCode
  ) {
    super(message);
    this.name = 'PublicWriteError';
  }

  static badRequest(message = 'Bad request'): PublicWriteError {
    return new PublicWriteError(400, message, 'BAD_REQUEST');
  }
  static notFound(message = 'Not found'): PublicWriteError {
    return new PublicWriteError(404, message, 'NOT_FOUND');
  }
  static conflict(message = 'Conflict'): PublicWriteError {
    return new PublicWriteError(409, message, 'CONFLICT');
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Résout le token API depuis une valeur d'en-tête `Authorization` brute
 * (`Bearer pk_live_…`). Lookup par hash sha256 dans `tenant_api_tokens` (non
 * révoqué), bump `last_used_at` en fire-and-forget. Partagé par le middleware
 * REST (`verifyPublicApiToken`) et le contexte GraphQL. Bearer-only →
 * naturellement CSRF-safe.
 */
export async function resolveApiTokenFromHeader(
  authHeader: string | null | undefined
): Promise<{ ok: false } | { ok: true; token: PublicApiToken }> {
  if (!supabaseAdmin) return { ok: false };

  if (typeof authHeader !== 'string' || !authHeader.startsWith(BEARER_PREFIX)) {
    return { ok: false };
  }
  const plain = authHeader.slice(BEARER_PREFIX.length).trim();
  if (plain.length === 0 || !plain.startsWith(TOKEN_PLAIN_PREFIX)) {
    return { ok: false };
  }

  const hash = sha256Hex(plain);
  const { data, error } = await supabaseAdmin
    .from('tenant_api_tokens')
    .select('id, tenant_id, scopes, revoked_at, comp')
    .eq('token_hash', hash)
    .maybeSingle();

  if (error) {
    logger.error('[public-write] token lookup error', error);
    return { ok: false };
  }
  if (!data || data.revoked_at) return { ok: false };

  // Bump last_used_at — fire-and-forget, on ne bloque pas la requête.
  void supabaseAdmin
    .from('tenant_api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(({ error: e }) => {
      if (e) logger.error('[public-write] last_used_at bump error', e);
    });

  // Charge l'état plan du tenant propriétaire — nécessaire au gate PLAN qui
  // détermine si cette clé a droit à la lecture/écriture (produit payant).
  const plan = await loadTenantPlanState(data.tenant_id as string);

  return {
    ok: true,
    token: {
      id: data.id as string,
      tenantId: data.tenant_id as string,
      scopes: Array.isArray(data.scopes) ? (data.scopes as string[]) : [],
      plan,
      comp: data.comp === true,
    },
  };
}

/**
 * Charge `{ plan, plan_status, plan_expires_at }` d'un tenant. Fail-closed sur
 * `discovery` (cf. FALLBACK_PLAN_STATE) si la row est absente / la requête
 * échoue — on ne veut jamais ouvrir un accès API payant sur un état inconnu.
 */
async function loadTenantPlanState(tenantId: string): Promise<TenantPlanState> {
  if (!supabaseAdmin) return FALLBACK_PLAN_STATE;
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('plan, plan_status, plan_expires_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    logger.error('[public-write] tenant plan lookup error', error);
    return FALLBACK_PLAN_STATE;
  }
  if (!data) return FALLBACK_PLAN_STATE;

  return {
    plan: (data.plan as TenantPlan) ?? FALLBACK_PLAN_STATE.plan,
    plan_status:
      (data.plan_status as PlanStatus) ?? FALLBACK_PLAN_STATE.plan_status,
    plan_expires_at:
      (data.plan_expires_at as string | null) ??
      FALLBACK_PLAN_STATE.plan_expires_at,
  };
}

/**
 * Variante node : résout le token depuis une `NextApiRequest`. Utilisée par le
 * middleware REST `withPublicWrite`. Délègue à `resolveApiTokenFromHeader`.
 */
export async function verifyPublicApiToken(
  req: NextApiRequest
): Promise<{ ok: false } | { ok: true; token: PublicApiToken }> {
  const raw = req.headers.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  return resolveApiTokenFromHeader(header);
}

/* ---------------------------------------------------------------------------
 * Idempotency (table Supabase bot_idempotency, partagée avec le bot).
 * Clés préfixées `pub:` + scopées par tenant → aucune collision inter-surface
 * ni inter-tenant (contrainte UNIQUE(tenant_id, cache_key)).
 * ------------------------------------------------------------------------- */

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_KEY_MAX_LEN = 200;

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
  // Body hash → réutiliser la même Idempotency-Key avec un body différent
  // (score corrigé) ne rejoue PAS silencieusement l'ancienne réponse.
  const bodyHash = sha256Hex(JSON.stringify(req.body ?? null)).slice(0, 8);
  return `pub:${req.method ?? 'POST'} ${req.url ?? ''} ${key} ${bodyHash}`;
}

async function readIdempotencyCache(
  cacheKey: string,
  tenantId: string
): Promise<{ status: number; body: unknown } | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('bot_idempotency')
    .select('status, body, expires_at')
    .eq('tenant_id', tenantId)
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  const exp = Date.parse(data.expires_at as string);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  return { status: data.status as number, body: data.body as unknown };
}

async function writeIdempotencyCache(
  cacheKey: string,
  status: number,
  body: unknown,
  tenantId: string
): Promise<void> {
  if (!supabaseAdmin) return;
  const expires_at = new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString();
  const { error } = await supabaseAdmin
    .from('bot_idempotency')
    .upsert(
      { cache_key: cacheKey, status, body, expires_at, tenant_id: tenantId },
      { onConflict: 'tenant_id,cache_key' }
    );
  if (error) logger.error('[public-write/idempotency] upsert error', error);
}

/* ---------------------------------------------------------------------------
 * withPublicWrite middleware
 * ------------------------------------------------------------------------- */

/** Contexte riche passé au handler d'écriture. */
export type PublicWriteContext<B = unknown, Q = unknown> = {
  token: PublicApiToken;
  /** Body parsé/validé (si `bodySchema` fourni), sinon `req.body` brut. */
  input: B;
  /** Query parsée/validée (si `querySchema` fourni), sinon `req.query` brut. */
  query: Q;
};

export type WithPublicWriteOptions = {
  /** Méthodes autorisées. Toute autre → 405 + header Allow. */
  methods: readonly string[];
  /** Scope requis (ex. `'matches:write'`). Absent du token → 403. */
  scope: ApiScope;
  /** Rate-limit. `key` = bucket dédié par endpoint. */
  rateLimit: {
    max: number;
    windowMs?: number;
    key: string;
    /** Sous-limite par token (en plus du bucket IP). Défaut : `max`/2. */
    perTokenMax?: number;
  };
  /** Honorer `Idempotency-Key` sur les méthodes non-safe. */
  idempotent?: boolean;
  /** Schéma zod du body (méthodes non-safe). Échec → 400 INVALID_BODY. */
  bodySchema?: ZodType;
  /** Schéma zod de la query (toutes méthodes). Échec → 400 INVALID_QUERY. */
  querySchema?: ZodType;
};

function sendError(
  res: NextApiResponse,
  status: number,
  error: string,
  code?: PublicWriteErrorCode
): void {
  res.status(status).json(code ? { error, code } : { error });
}

/**
 * Wrap un handler d'écriture publique : method gate, auth token Bearer, scope
 * gate, rate-limit IP + par token, maintenance gate, validation zod,
 * idempotency, enveloppe d'erreur. Le handler reçoit `(req, res, ctx)` et écrit
 * lui-même la réponse via `res.status().json()` (comme le bot) ; il peut throw
 * `PublicWriteError.*` pour court-circuiter proprement.
 */
export function withPublicWrite<B = unknown, Q = unknown>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse,
    ctx: PublicWriteContext<B, Q>
  ) => Promise<unknown> | unknown,
  opts: WithPublicWriteOptions
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
  const allowed = new Set(opts.methods.map((m) => m.toUpperCase()));
  const allowHeader = opts.methods.join(', ');
  const perTokenMax =
    opts.rateLimit.perTokenMax ??
    Math.max(1, Math.ceil(opts.rateLimit.max / 2));

  return async function publicWriteRoute(
    req: NextApiRequest,
    res: NextApiResponse
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const method = (req.method ?? '').toUpperCase();
    if (!allowed.has(method)) {
      res.setHeader('Allow', allowHeader);
      return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    }

    // Rate-limit IP (applyRateLimit émet son propre 429 + Retry-After).
    if (
      applyRateLimit(
        req,
        res,
        {
          max: opts.rateLimit.max,
          windowMs: opts.rateLimit.windowMs ?? 60_000,
        },
        opts.rateLimit.key
      )
    ) {
      return;
    }

    if (!supabaseAdmin) {
      return sendError(res, 503, 'Service unavailable.', 'INTERNAL');
    }

    // Auth : token Bearer scopé.
    const auth = await verifyPublicApiToken(req);
    if (!auth.ok) {
      return sendError(
        res,
        401,
        'Invalid or missing API token.',
        'UNAUTHORIZED'
      );
    }
    const { token } = auth;

    // Rate-limit par token (défense contre un token unique qui draine le bucket).
    if (
      applyActorRateLimit(
        res,
        token.id,
        { max: perTokenMax, windowMs: opts.rateLimit.windowMs ?? 60_000 },
        opts.rateLimit.key
      )
    ) {
      return;
    }

    // Plan gate : l'accès API (lecture/écriture) est un produit payant. On
    // dérive l'action de la méthode (safe → read/apiRead, sinon write/apiWrite)
    // et on refuse 403 `plan_required` si le tenant n'a pas la capacité. Une clé
    // `comp` (partenaire) bypasse ce gate. `foundation` passe toujours ; un
    // tenant `discovery` / plan expiré (sans comp) échoue.
    const planDenial: ApiPlanDenial | null = checkApiTokenAccess(
      token,
      apiActionForMethod(method),
      Date.now()
    );
    if (planDenial) {
      res.status(403).json(planDenial);
      return;
    }

    // Scope gate.
    if (!hasScope(token.scopes, opts.scope)) {
      return sendError(
        res,
        403,
        `Token lacks required scope '${opts.scope}'.`,
        'INSUFFICIENT_SCOPE'
      );
    }

    // Maintenance gate sur les writes.
    if (!SAFE_METHODS.has(method) && (await isBotMaintenanceMode())) {
      res.setHeader('Retry-After', '60');
      return sendError(
        res,
        503,
        'Site en maintenance, écritures temporairement désactivées.',
        'MAINTENANCE_MODE'
      );
    }

    // Validation zod.
    let input = req.body as B;
    if (opts.bodySchema && !SAFE_METHODS.has(method)) {
      const parsed = opts.bodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: formatZodError(parsed.error),
          code: 'INVALID_BODY',
          fields: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      input = parsed.data as B;
    }
    let query = req.query as Q;
    if (opts.querySchema) {
      const parsed = opts.querySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: formatZodError(parsed.error),
          code: 'INVALID_QUERY',
          fields: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      query = parsed.data as Q;
    }

    // Idempotency (méthodes non-safe uniquement).
    if (opts.idempotent && !SAFE_METHODS.has(method)) {
      const userKey = readIdempotencyKey(req);
      if (userKey) {
        const cacheKey = idempotencyCacheKey(req, userKey);
        const cached = await readIdempotencyCache(cacheKey, token.tenantId);
        if (cached) {
          res.setHeader('Idempotency-Replay', 'true');
          res.status(cached.status).json(cached.body);
          return;
        }
        // Capture la réponse éventuelle (2xx uniquement) pour la rejouer.
        const originalJson = res.json.bind(res);
        res.json = ((body: unknown) => {
          const status = res.statusCode || 200;
          if (status >= 200 && status < 300) {
            void writeIdempotencyCache(
              cacheKey,
              status,
              body,
              token.tenantId
            ).catch((e) =>
              logger.error('[public-write/idempotency] async write error', e)
            );
          }
          return originalJson(body);
        }) as typeof res.json;
      }
    }

    try {
      await handler(req, res, { token, input, query });
    } catch (err) {
      if (err instanceof PublicWriteError) {
        return sendError(res, err.status, err.message, err.code);
      }
      logger.error(`[public-write/${opts.rateLimit.key}] unhandled error`, err);
      if (!res.headersSent) {
        sendError(res, 500, 'Internal server error', 'INTERNAL');
      }
    }
  };
}
