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
import {
  DEFAULT_TENANT_ID,
  isActiveTenantId,
  getTenantIdByGuildId,
  __resetTenantLookupCachesForTests,
} from './tenant';
import {
  loadTenantPlanStateForBot,
  checkBotPlanCapability,
  type BotCapabilityRequirement,
} from './billing/botPlanGate';
import type { TenantPlanState } from './billing/planFeatures';

// Fallback tenant bucket pour les routes `crossTenant: true` qui utilisent
// l'idempotency cache. Voir le commentaire dans le bloc idempotency.
const DEFAULT_TENANT_ID_FOR_CACHE = DEFAULT_TENANT_ID;

/**
 * Per-tenant API key lookup (100% per-tenant — le fallback env legacy a été
 * retiré).
 *
 * Each tenant is assigned its own bot API key via
 * `POST /api/admin/tenants/:id/rotate-secrets`. Incoming `x-api-key` is
 * sha256-hashed and looked up in `tenant_secrets.bot_api_key_hash`. On match,
 * the tenant id is returned and `withBotRoute` set `req.botContext.tenantId`
 * authoritatively (the `x-tenant-id` header is informational only — the key
 * wins).
 *
 * Il n'y a PLUS de fallback sur `BOT_API_KEY` env : chaque tenant DOIT avoir sa
 * clé seedée dans `tenant_secrets`. Returns `{ ok: false }` si la clé ne matche
 * aucune row (→ 401 côté middleware).
 */
/**
 * Cache des clés d'API bot vérifiées, en mémoire du process.
 *
 * Cette lecture se faisait à CHAQUE appel du bot — 8 898 lectures de
 * `tenant_secrets` en 24 h en production, soit 8 % de tout le trafic base, pour
 * répondre chaque fois la même chose. Le bot interroge le site en continu
 * (outbox toutes les 60 s, rappels, role-sync, annonces live…), et chacun de
 * ces appels payait une résolution de secret.
 *
 * Deux garde-fous sur la sécurité :
 *   - on ne met en cache QUE les succès. Une clé refusée est re-vérifiée à
 *     chaque tentative, donc une clé fraîchement tournée est acceptée tout de
 *     suite — pas de fenêtre où le nouveau secret serait rejeté ;
 *   - le TTL est court (60 s), ce qui borne à une minute la durée pendant
 *     laquelle une clé RÉVOQUÉE resterait acceptée par un process déjà chaud.
 *     C'est le seul compromis, et il est explicite.
 */
const API_KEY_TTL_MS = 60_000;
const API_KEY_CACHE_MAX = 50;
const apiKeyCache = new Map<
  string,
  { tenantId: string; isPlatformKey: boolean; expiresAt: number }
>();

/* ---------------------------------------------------------------------------
 * Clé « plateforme » : agir pour le compte d'un autre tenant
 * -------------------------------------------------------------------------
 *
 * Le bot Discord invité par un nouveau tenant est NOTRE process mutualisé
 * (l'URL d'invitation est bâtie sur notre `DISCORD_CLIENT_ID`), et ce process
 * ne porte qu'une seule `BOT_API_KEY`. Sans ce mécanisme, une commande lancée
 * depuis le serveur du tenant B s'authentifiait comme le tenant propriétaire
 * de la clé et écrivait chez lui : corruption et fuite entre tenants.
 *
 * Une clé marquée `tenant_secrets.is_platform_key` peut donc désigner sa cible
 * via `x-tenant-id`. Trois garde-fous, tous obligatoires :
 *   - le drapeau est opt-in et faux par défaut : une clé de tenant ordinaire
 *     (bot auto-hébergé) reste strictement scopée à son propre tenant ;
 *   - le tenant ciblé doit exister ET être actif (sinon 404) ;
 *   - si le bot envoie `x-guild-id`, ce guild doit appartenir au tenant ciblé
 *     (sinon 403). C'est ce qui transforme une confiance aveugle en une
 *     vérification : le bot prouve d'où vient l'interaction.
 *
 * En l'absence d'en-tête `x-tenant-id`, le comportement est inchangé — la clé
 * détermine le tenant.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Oublie les clés mémorisées d'un espace (ou de tous).
 *
 * Le cache d'authentification garde une empreinte 60 s. Sans cet appel, une clé
 * révoquée pour cause de fuite restait acceptée jusqu'à une minute de plus —
 * exactement le moment où l'on veut qu'elle cesse tout de suite.
 *
 * Portée : l'instance courante. En serverless, les autres instances gardent
 * leur cache jusqu'au TTL ; c'est une atténuation, pas une garantie, et la
 * seule garantie dure reste la fin du TTL.
 */
export function invalidateBotApiKeyCache(tenantId?: string): void {
  if (!tenantId) {
    apiKeyCache.clear();
    return;
  }
  for (const [hash, entry] of apiKeyCache) {
    if (entry.tenantId === tenantId) apiKeyCache.delete(hash);
  }
}

/** Purge les caches d'impersonation. Usage strictement test. */
export function __resetBotImpersonationCachesForTests(): void {
  apiKeyCache.clear();
  __resetTenantLookupCachesForTests();
}

/** Refus normalisé émis par la résolution d'impersonation. */
type ImpersonationDenial = { status: number; body: Record<string, unknown> };

/**
 * Résout le tenant effectif d'une requête bot tenant-scopée.
 *
 * Renvoie `{ tenantId }` (celui de la clé, ou la cible légitime d'une clé
 * plateforme) ou `{ denial }` à renvoyer tel quel au bot.
 */
async function resolveEffectiveTenant(
  req: NextApiRequest,
  auth: { tenantId: string; isPlatformKey: boolean },
  routeKey: string
): Promise<{ tenantId: string } | { denial: ImpersonationDenial }> {
  const rawTenant = req.headers['x-tenant-id'];
  const headerTenant = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
  const requested =
    typeof headerTenant === 'string' && headerTenant.length > 0
      ? headerTenant.toLowerCase()
      : null;

  const keyTenant = auth.tenantId.toLowerCase();

  // Clé ordinaire (bot auto-hébergé) : le scope ne bouge pas. On conserve le
  // warn historique quand l'en-tête contredit la clé — c'est un bug côté bot.
  if (!auth.isPlatformKey) {
    if (requested && requested !== keyTenant) {
      logger.warn(
        '[bot/tenant] x-tenant-id header conflicts with per-tenant API key — key wins',
        { header: requested, keyTenant, route: routeKey }
      );
    }
    return { tenantId: auth.tenantId };
  }

  /* --- Clé plateforme -----------------------------------------------------
   *
   * Le guild prime sur l'en-tête tenant : c'est le seul signal que le site
   * peut VÉRIFIER (`discord_guilds`), là où `x-tenant-id` n'est qu'une
   * affirmation du bot — et une affirmation qui, cache tenant-config froid,
   * retombe sur le tenant par défaut. Un guild connu tranche donc, même s'il
   * contredit l'en-tête.
   */
  const rawGuild = req.headers['x-guild-id'];
  const headerGuild = Array.isArray(rawGuild) ? rawGuild[0] : rawGuild;

  if (typeof headerGuild === 'string' && headerGuild.length > 0) {
    if (!DISCORD_ID_RE.test(headerGuild)) {
      return {
        denial: {
          status: 400,
          body: {
            error: 'x-guild-id must be a Discord snowflake.',
            code: 'INVALID_GUILD_HEADER',
          },
        },
      };
    }

    const owner = await getTenantIdByGuildId(headerGuild);
    if (owner) {
      const ownerId = owner.toLowerCase();
      if (requested && requested !== ownerId) {
        logger.warn(
          '[bot/tenant] platform key: x-tenant-id contradicts the guild owner — guild wins',
          { guildId: headerGuild, requested, owner: ownerId, route: routeKey }
        );
      }
      if (!(await isActiveTenantId(ownerId))) {
        return {
          denial: {
            status: 404,
            body: {
              error: 'Unknown or inactive tenant.',
              code: 'UNKNOWN_TENANT',
            },
          },
        };
      }
      return { tenantId: ownerId };
    }

    // Guild inconnu de `discord_guilds` : rien à prouver ni à contredire. On
    // retombe sur la résolution par en-tête ci-dessous (et, à défaut, sur la
    // clé) plutôt que de refuser — un guild pas encore lié ne doit pas couper
    // le bot.
    logger.warn('[bot/tenant] platform key: unlinked guild', {
      guildId: headerGuild,
      route: routeKey,
    });
  }

  if (!requested || requested === keyTenant) {
    return { tenantId: auth.tenantId };
  }

  if (!UUID_RE.test(requested)) {
    return {
      denial: {
        status: 400,
        body: {
          error: 'x-tenant-id must be a valid UUID.',
          code: 'INVALID_TENANT_HEADER',
        },
      },
    };
  }

  if (!(await isActiveTenantId(requested))) {
    return {
      denial: {
        status: 404,
        body: { error: 'Unknown or inactive tenant.', code: 'UNKNOWN_TENANT' },
      },
    };
  }

  return { tenantId: requested };
}

export async function verifyBotApiKeyMultiTenant(
  req: NextApiRequest
): Promise<
  { ok: false } | { ok: true; tenantId: string; isPlatformKey: boolean }
> {
  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) {
    return { ok: false };
  }
  if (!supabaseAdmin) return { ok: false };

  const hash = crypto.createHash('sha256').update(provided).digest('hex');

  const cached = apiKeyCache.get(hash);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ok: true,
      tenantId: cached.tenantId,
      isPlatformKey: cached.isPlatformKey,
    };
  }

  // Deux empreintes peuvent être valables : la courante, et la précédente
  // pendant sa fenêtre de grâce (rotation sans coupure — cf. T8). Sans cette
  // seconde chance, régénérer une clé coupait le bot en place à la milliseconde,
  // jusqu'à ce que quelqu'un aille reposer la nouvelle valeur sur le serveur.
  const { data } = await supabaseAdmin
    .from('tenant_secrets')
    .select(
      'tenant_id, is_platform_key, bot_api_key_hash, previous_key_hash, previous_key_expires_at'
    )
    .or(`bot_api_key_hash.eq.${hash},previous_key_hash.eq.${hash}`)
    .maybeSingle();

  if (data?.tenant_id) {
    const row = data as {
      tenant_id: string;
      is_platform_key?: boolean | null;
      bot_api_key_hash?: string | null;
      previous_key_hash?: string | null;
      previous_key_expires_at?: string | null;
    };
    // Clé précédente : n'est acceptée que tant que sa fenêtre court. Passé
    // l'échéance, elle vaut une clé inconnue.
    if (row.bot_api_key_hash !== hash) {
      const until = row.previous_key_expires_at
        ? Date.parse(row.previous_key_expires_at)
        : NaN;
      if (!Number.isFinite(until) || until <= Date.now()) {
        return { ok: false };
      }
    }
    const tenantId = data.tenant_id as string;
    const isPlatformKey = data.is_platform_key === true;
    // Trace d'usage, au plus une fois par TTL de cache (on n'arrive ici que sur
    // un miss). Best-effort : une écriture ratée ne refuse pas l'appel.
    void supabaseAdmin
      .from('tenant_secrets')
      .update({ last_used_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .then(undefined, () => undefined);
    apiKeyCache.set(hash, {
      tenantId,
      isPlatformKey,
      expiresAt: Date.now() + API_KEY_TTL_MS,
    });
    if (apiKeyCache.size > API_KEY_CACHE_MAX) {
      // Borne mémoire : une clé inventée par requête ne doit pas faire enfler
      // le cache. On repart de zéro plutôt que d'implémenter un LRU pour ce
      // qui compte, en pratique, une poignée d'entrées.
      const oldest = apiKeyCache.keys().next().value;
      if (oldest !== undefined) apiKeyCache.delete(oldest);
    }
    return { ok: true, tenantId, isPlatformKey };
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
     *
     * `actorField` overrides which body/query field holds the actor's Discord
     * id. Defaults to `actorDiscordUserId` (staff convention). Captain-facing
     * routes (e.g. /report, /checkin) send the id under `discordUserId`, so
     * they pass `actorField: 'discordUserId'` to key the sub-limit on the
     * captain without renaming the request field (contract-stable).
     */
    perActor?: {
      max: number;
      windowMs?: number;
      actorField?: string;
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
   * Gate PLAN « Régie solidaire » (Phase 0b → branchée). Déclare qu'une route
   * bot est une FEATURE PREMIUM et exige une capacité du plan effectif du tenant
   * appelant (cf. utils/billing/botPlanGate.ts) :
   *   - `'discordEventOps:full'` : run-of-show / production (cast, veto, drafts,
   *     broadcast on-air, events, runs — Régie+),
   *   - `'arbitration'` : arbitrage litiges (disputes, resolve-dispute,
   *     blacklist-alert — Régie+),
   *   - `'ratings'` : rating joueur (réservé, pas d'endpoint bot pour l'instant).
   *
   * DÉFAUT = aucune exigence : la route est « basic », ouverte à tous les
   * tenants actifs (y compris le palier gratuit `discovery`). Le plan du tenant
   * n'est chargé (1 round-trip `tenants`) QUE si ce champ est présent → les
   * routes de base ne paient aucun coût.
   *
   * Si le tenant ne remplit pas l'exigence → 403 { error:'plan_required',
   * message, requiredCapability }. `foundation` a toutes les capacités → passe
   * toujours ; un plan payant expiré retombe sur `discovery` → 403.
   *
   * INCOMPATIBLE avec `crossTenant: true` (aucun tenant résolu → rien à gater) :
   * sur une route crossTenant, ce champ est ignoré (warn en dev). Les résolveurs
   * globaux (events/pending, cast/upcoming, events/[id]/ack) restent non gatés au
   * niveau middleware ; cf. docs/BOT_API_CONTRACT.md § Gate PLAN.
   */
  requireCapability?: BotCapabilityRequirement;
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

/**
 * Requête bot sur une route TENANT-SCOPÉE. `withBotRoute` garantit
 * `req.botContext.tenantId` (string non-null) avant d'appeler le handler — un
 * handler peut typer son paramètre `req: BotTenantRequest` pour lire
 * `req.botContext.tenantId` sans `!`.
 */
export type BotTenantRequest = NextApiRequest & {
  botContext: { tenantId: string; plan?: TenantPlanState };
};

/**
 * Requête bot sur une route `crossTenant: true` (global resolver type
 * /tenants/all-configs, /events/pending). Le middleware NE résout PAS de tenant :
 * `req.botContext` reste `undefined`. Typer un handler crossTenant
 * `req: BotCrossTenantRequest` fait échouer à la COMPILATION toute lecture de
 * `req.botContext.tenantId` — c'est précisément la classe de bug que ce type
 * prévient (avant : `req.botContext!.tenantId` compilait et renvoyait undefined).
 */
export type BotCrossTenantRequest = NextApiRequest & {
  botContext?: undefined;
  /** Toujours posé par le middleware : cf. types/botContext.d.ts. */
  botKey: { tenantId: string; isPlatformKey: boolean };
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DISCORD_ID_RE = /^[0-9]{15,25}$/;

// Overloads : le type de `req` passé au handler est narrowé selon `crossTenant`.
//   - crossTenant absent/false → BotTenantRequest (tenantId garanti)
//   - crossTenant: true        → BotCrossTenantRequest (lire req.botContext
//                                 .tenantId devient une erreur de compilation)
export function withBotRoute(
  handler: (
    req: BotTenantRequest,
    res: NextApiResponse
  ) => unknown | Promise<unknown>,
  options: BotRouteOptions & { crossTenant?: false }
): NextApiHandler;
export function withBotRoute(
  handler: (
    req: BotCrossTenantRequest,
    res: NextApiResponse
  ) => unknown | Promise<unknown>,
  options: BotRouteOptions & { crossTenant: true }
): NextApiHandler;
export function withBotRoute(
  // Signature d'implémentation : `any` pour rester compatible avec les deux
  // overloads ci-dessus (le narrowing réel est porté par les signatures
  // publiques BotTenantRequest / BotCrossTenantRequest).
  handler: (req: any, res: NextApiResponse) => unknown | Promise<unknown>,
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

    // Auth : per-tenant lookup uniquement (tenant_secrets.bot_api_key_hash).
    // Plus de fallback env legacy — une clé qui ne matche aucun tenant → 401.
    const authResult = await verifyBotApiKeyMultiTenant(req);
    if (!authResult.ok) {
      return res.status(401).json({ error: 'Invalid or missing API key.' });
    }

    // Identité de l'appelant, posée avant tout scoping : les résolveurs
    // globaux (crossTenant) en ont besoin pour ne pas servir les données de
    // tous les tenants à un bot auto-hébergé.
    req.botKey = {
      tenantId: authResult.tenantId,
      isPlatformKey: authResult.isPlatformKey,
    };

    // Multi-tenant scoping :
    //
    // 1. Si la route est `crossTenant: true` (global resolver type
    //    /tenants/all-configs, /events/pending), on ne touche pas a
    //    `req.botContext.tenantId` — le handler ne doit pas le lire.
    //
    // 2. Sinon, la clé per-tenant est AUTORITAIRE : elle détermine le tenant
    //    (le hash matche une row `tenant_secrets`). Le header `x-tenant-id`
    //    n'est plus requis ni validé (le fallback env legacy a été retiré) ;
    //    s'il est présent et contredit la clé, on warn (signal d'un bug bot).
    if (options.crossTenant !== true) {
      const resolved = await resolveEffectiveTenant(
        req,
        authResult,
        options.rateLimit.key
      );
      if ('denial' in resolved) {
        return res.status(resolved.denial.status).json(resolved.denial.body);
      }

      req.botContext = {
        ...(req.botContext ?? {}),
        tenantId: resolved.tenantId,
      };

      // Gate PLAN « Régie solidaire ».
      //  - BASELINE : le bot lui-même est réservé à la Coupe féminine
      //    (`foundation`) et aux plans payants. Un tenant `discovery` (gratuit)
      //    ou un plan payant expiré/past_due n'a PAS le bot → 403 sur TOUTE route
      //    tenant-scopée. Seuls les admins Women's Cup utilisent le bot sans plan.
      //  - PREMIUM : sur une route qui déclare `requireCapability` (production
      //    live, arbitrage), on gate en plus.
      // Le plan (mis en cache 60 s) est attaché à `req.botContext.plan`.
      // Le plan gaté est celui du tenant EFFECTIF : une clé plateforme agissant
      // pour le tenant B doit se heurter au plan de B, jamais au sien.
      const planState = await loadTenantPlanStateForBot(resolved.tenantId);
      req.botContext.plan = planState;

      const baselineDenial = checkBotPlanCapability(planState, 'discordBot');
      if (baselineDenial) {
        return res.status(403).json(baselineDenial);
      }

      if (options.requireCapability) {
        const denial = checkBotPlanCapability(
          planState,
          options.requireCapability
        );
        if (denial) {
          return res.status(403).json(denial);
        }
      }
    } else if (options.requireCapability) {
      // crossTenant + requireCapability = config incohérente : aucun tenant
      // résolu, donc rien à gater. On l'ignore (le résolveur global reste
      // ouvert) et on le signale — c'est un bug de déclaration de route.
      logger.warn(
        '[bot/plan] requireCapability ignoré sur une route crossTenant (aucun tenant à gater)',
        {
          route: options.rateLimit.key,
          requireCapability: options.requireCapability,
        }
      );
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
      const actorField =
        options.rateLimit.perActor.actorField || 'actorDiscordUserId';
      const actorFromBody =
        typeof (req.body as Record<string, unknown> | null)?.[actorField] ===
        'string'
          ? ((req.body as Record<string, unknown>)[actorField] as string).trim()
          : '';
      const actorFromQuery =
        typeof req.query[actorField] === 'string'
          ? (req.query[actorField] as string).trim()
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
