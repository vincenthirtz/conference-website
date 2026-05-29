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
import type { ZodType } from 'zod';
import { applyActorRateLimit, applyRateLimit } from './rateLimit';
import { supabaseAdmin } from './supabase';
import { isBotMaintenanceMode } from './maintenance';
import { logger } from './logger';
import { formatZodError } from './validation';
import { DEFAULT_TENANT_ID } from './tenant';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fallback tenant bucket pour les routes `crossTenant: true` qui utilisent
// l'idempotency cache. Voir le commentaire dans le bloc idempotency.
const DEFAULT_TENANT_ID_FOR_CACHE = DEFAULT_TENANT_ID;

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

/**
 * Per-tenant API key lookup.
 *
 * V1 transition strategy: each tenant can be assigned its own bot API key via
 * `POST /api/admin/tenants/:id/rotate-secrets`. Incoming `x-api-key` is
 * sha256-hashed and looked up in `tenant_secrets.bot_api_key_hash`. If found,
 * we return the matching tenant id so `withBotRoute` can authoritatively set
 * `req.botContext.tenantId` (the `x-tenant-id` header is ignored if it
 * conflicts — the key wins).
 *
 * If the key doesn't match any row in `tenant_secrets`, we fall back to the
 * legacy global `BOT_API_KEY` env var (constant-time compare). On match,
 * `tenantId` is `null` and the caller falls back to `resolveTenantId(req)`
 * (header-based).
 *
 * Returns `{ ok: false }` if neither match.
 */
export async function verifyBotApiKeyMultiTenant(
  req: NextApiRequest
): Promise<
  | { ok: false }
  | { ok: true; tenantId: string | null /* null = legacy env match */ }
> {
  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) {
    return { ok: false };
  }

  // 1. Per-tenant lookup (sha256(provided) → tenant_id)
  if (supabaseAdmin) {
    const hash = crypto.createHash('sha256').update(provided).digest('hex');
    const { data } = await supabaseAdmin
      .from('tenant_secrets')
      .select('tenant_id')
      .eq('bot_api_key_hash', hash)
      .maybeSingle();
    if (data?.tenant_id) {
      return { ok: true, tenantId: data.tenant_id as string };
    }
  }

  // 2. Legacy global env fallback (constant-time compare)
  const expected = process.env.BOT_API_KEY;
  if (expected) {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { ok: true, tenantId: null };
    }
  }

  return { ok: false };
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
  /**
   * If true, this route does not require a tenant context — it's a global
   * resolver (e.g. /tenants/all-configs, /events/pending). The handler
   * won't have `req.botContext.tenantId` set; do not consume it.
   *
   * Pour ces routes :
   *   - le header `x-tenant-id` n'est PAS valide (peut etre present ou
   *     absent, on l'ignore),
   *   - aucun round-trip d'existence n'est fait,
   *   - `req.botContext.tenantId` reste `undefined` — c'est volontaire et
   *     contractuel : si un handler `crossTenant` lit cette valeur, c'est
   *     un bug d'implementation. La table d'inventaire dans
   *     docs/BOT_API_CONTRACT.md liste les 5 routes flaggees.
   */
  crossTenant?: boolean;
  /**
   * Schéma zod validant le body sur les méthodes non-safe (POST/PATCH/DELETE).
   * En cas d'échec → 400 { error, code:'INVALID_BODY', fields }. Le résultat
   * parsé/typé est injecté dans `req.botInput` (le handler le lit via
   * `req.botInput as z.infer<typeof schema>`). `req.body` brut n'est PAS muté
   * (l'idempotency le hash et le per-actor le lit). Pour une route multi-méthode
   * dont les bodies diffèrent (POST vs DELETE), utiliser un `z.union`/discriminé.
   */
  bodySchema?: ZodType;
  /**
   * Schéma zod validant la query string (req.query). S'applique à toutes les
   * méthodes. Échec → 400 { error, code:'INVALID_QUERY', fields }. Résultat
   * dans `req.botQuery`. Note : req.query est toujours string|string[], donc le
   * schéma doit coercer (z.coerce.number(), etc.) si besoin de types non-string.
   */
  querySchema?: ZodType;
};

/* ---------------------------------------------------------------------------
 * Tenant existence cache (60s, in-memory)
 *
 * Le set de tenants change tres rarement (creation manuelle via /admin) et
 * une requete bot peut etre tres rapide, donc on cache les existences pour
 * eviter 1 round-trip Supabase par appel. Volontairement *local* a la
 * Lambda — pas besoin de coherence cross-instance, un nouveau tenant
 * deviendra valide sur la prochaine instance dans la minute qui suit.
 * Les hits/miss/expiry sont silencieux (pas de log).
 * ------------------------------------------------------------------------- */

const TENANT_EXISTS_TTL_MS = 60_000;
const tenantExistsCache = new Map<string, { exists: boolean; expiresAt: number }>();

async function tenantExists(tenantId: string): Promise<boolean> {
  const now = Date.now();
  const cached = tenantExistsCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    return cached.exists;
  }
  if (!supabaseAdmin) {
    // Sans DB on ne peut pas valider — on retourne true et on laissera le
    // handler segfauter sur sa propre query (cas degrade improbable, deja
    // bloque par le check supabaseAdmin plus haut).
    return true;
  }
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    // Erreur DB transitoire : on ne cache pas le verdict (next call retentera)
    // et on laisse l'existence supposee vraie pour ne pas bloquer le trafic
    // sur un hoquet Supabase.
    logger.warn('[bot/tenant] tenant existence check failed', { tenantId });
    return true;
  }
  const exists = Boolean(data);
  tenantExistsCache.set(tenantId, {
    exists,
    expiresAt: now + TENANT_EXISTS_TTL_MS,
  });
  return exists;
}

/** Test-only : flush the tenant existence cache between scenarios. */
export function __resetTenantExistsCache() {
  tenantExistsCache.clear();
}

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

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database unavailable.' });
    }

    // Auth : per-tenant lookup (tenant_secrets.bot_api_key_hash) avec
    // fallback sur l'env BOT_API_KEY pour la transition V1.
    const authResult = await verifyBotApiKeyMultiTenant(req);
    if (!authResult.ok) {
      // Si aucune key per-tenant n'est seedee ET l'env est absent → c'est
      // une erreur de config serveur, pas une mauvaise key.
      if (!process.env.BOT_API_KEY) {
        logger.error(
          `[bot/${options.rateLimit.key}] BOT_API_KEY unset and no per-tenant key matched`
        );
        return res.status(500).json({ error: 'Endpoint not configured.' });
      }
      return res.status(401).json({ error: 'Invalid or missing API key.' });
    }

    // Multi-tenant scoping (V2, durci) :
    //
    // 1. Si la route est `crossTenant: true` (global resolver type
    //    /tenants/all-configs, /events/pending), on ne touche pas a
    //    `req.botContext.tenantId` — le handler ne doit pas le lire. Tout
    //    le bloc de validation est skippe.
    //
    // 2. Sinon, si la key matche une row `tenant_secrets`, le tenantId est
    //    *autoritaire* (provient directement de la DB) — on ignore le
    //    header `x-tenant-id` meme s'il contredit. Un warn est emis en cas
    //    de mismatch pour debug.
    //
    // 3. Sinon (fallback env legacy), le header devient REQUIS :
    //      - absent       → 400 MISSING_TENANT_ID
    //      - non-UUID     → 400 INVALID_TENANT_ID
    //      - tenant absent en DB → 404 UNKNOWN_TENANT
    //    Le cache `tenantExists()` evite 1 round-trip Supabase a chaque
    //    requete bot (TTL 60s).
    if (options.crossTenant !== true) {
      let resolvedTenantId: string;

      if (authResult.tenantId !== null) {
        // Per-tenant key match : la key est autoritaire. Si un header
        // contradictoire est present, on warn (signal d'un bug cote bot,
        // pas un cas a 400 — la key gagne).
        const rawHeader = req.headers['x-tenant-id'];
        const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
        if (
          typeof headerValue === 'string' &&
          headerValue.length > 0 &&
          headerValue.toLowerCase() !== authResult.tenantId.toLowerCase()
        ) {
          logger.warn(
            '[bot/tenant] x-tenant-id header conflicts with per-tenant API key — key wins',
            {
              header: headerValue,
              keyTenant: authResult.tenantId,
              route: options.rateLimit.key,
            }
          );
        }
        resolvedTenantId = authResult.tenantId;
      } else {
        // Fallback env legacy : on durcit la lecture du header.
        const rawHeader = req.headers['x-tenant-id'];
        const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

        if (
          headerValue === undefined ||
          headerValue === null ||
          (typeof headerValue === 'string' && headerValue.length === 0)
        ) {
          return res.status(400).json({
            error: 'x-tenant-id header is required.',
            code: 'MISSING_TENANT_ID',
          });
        }
        if (typeof headerValue !== 'string' || !UUID_RE.test(headerValue)) {
          return res.status(400).json({
            error: 'x-tenant-id header must be a valid UUID.',
            code: 'INVALID_TENANT_ID',
          });
        }

        const candidate = headerValue.toLowerCase();
        if (!(await tenantExists(candidate))) {
          return res.status(404).json({
            error: 'Unknown tenant id.',
            code: 'UNKNOWN_TENANT',
          });
        }
        resolvedTenantId = candidate;
      }

      req.botContext = {
        ...(req.botContext ?? {}),
        tenantId: resolvedTenantId,
      };
    }

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

    // Validation zod du body (méthodes non-safe) et de la query. Faite après
    // l'auth + la résolution tenant + le per-actor (qui lisent le body brut),
    // et avant l'idempotency (on ne cache pas un 400 de toute façon, et le
    // body invalide ne doit pas être traité). On NE mute pas req.body : le
    // résultat parsé va dans req.botInput / req.botQuery.
    if (options.bodySchema && !SAFE_METHODS.has(method)) {
      const parsed = options.bodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: formatZodError(parsed.error),
          code: 'INVALID_BODY',
          fields: parsed.error.flatten().fieldErrors,
        });
      }
      req.botInput = parsed.data;
    }
    if (options.querySchema) {
      const parsed = options.querySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: formatZodError(parsed.error),
          code: 'INVALID_QUERY',
          fields: parsed.error.flatten().fieldErrors,
        });
      }
      req.botQuery = parsed.data;
    }

    // Idempotency: only honored for unsafe methods.
    if (options.idempotent && !SAFE_METHODS.has(method)) {
      const userKey = readIdempotencyKey(req);
      if (userKey) {
        const cacheKey = idempotencyCacheKey(req, userKey);
        // Scope cache lookup + write par tenant (S3 / Phase 1c) — pas de leak
        // si deux tenants utilisent par hasard la meme Idempotency-Key.
        //
        // Pour les routes `crossTenant: true` (ex: /tenants/link-guild,
        // /events/:id/ack), `req.botContext.tenantId` est undefined : on
        // utilise le DEFAULT_TENANT_ID comme bucket de scoping. Ces routes
        // sont globales par design donc une "collision" entre tenants n'est
        // pas un risque metier.
        const tenantIdForCache =
          req.botContext?.tenantId ?? DEFAULT_TENANT_ID_FOR_CACHE;
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
