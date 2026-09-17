// utils/tenant.ts
//
// Phase 1 (multi-tenant) plumbing.
//
// ============================================================================
// Multi-tenant — périmètre d'un espace
// ============================================================================
//
// DÉCISION PRODUIT : un espace n'a PAS de site public. Il reçoit trois
// surfaces, et trois seulement — le bot Discord, le back-office, et l'API.
// Le site public reste celui de l'association : owwomenscup.fr ne change pas,
// et il n'existe pas de pages `/<espace>/...`.
//
// Ce que cela implique ici :
//
//   - Les pages publiques servent l'espace historique et n'ont aucune raison
//     de résoudre un tenant. Elles gardent leur génération statique.
//   - Les ROUTES D'API publiques, elles, sont consommées PAR les espaces :
//     elles résolvent le tenant par requête via
//     `resolveTenantIdForPublicRequestAsync` — `?tenant=<slug>` est le
//     mécanisme prévu pour ça (une clé d'API authentifiée porte déjà son
//     tenant, cf. `utils/publicWriteApi.ts`). Le domaine et le préfixe de
//     chemin restent reconnus, sans usage aujourd'hui.
//   - Les routes JOUEUSE (`pages/api/player/**`, `teams/**`, `demandes/**`,
//     `withSubjectRoute`) passent par UN résolveur, `resolvePlayerTenant` :
//     équipe active prouvée → domaine propre → appartenance stable → défaut.
//     La règle complète est en tête de ce résolveur, plus bas.
//   - Le back-office résout le tenant depuis la session staff (tenant actif,
//     cf. `utils/adminTenants.ts`), et le bot depuis sa clé et le serveur
//     d'origine (cf. `utils/botAuth.ts`).
//
// ============================================================================
// Bot side (unchanged)
// ============================================================================
//
// V1 behaviour (`resolveTenantId`): the header is OPTIONAL. If absent or
// malformed we fall back to `DEFAULT_TENANT_ID`. This keeps the legacy bot
// deployments, manual scripts and existing tests working unchanged.
//
// V2 behaviour (post Phase 3): the header will become REQUIRED. Missing
// header → 400, unknown tenant → 404. That switch is owned by Phase 3, not
// here.

import type { NextApiRequest } from 'next';
import type { IncomingMessage } from 'http';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { TEAM_SCOPE_QUERY_PARAM } from './teamScopeParam';
import {
  tenantHasCapability,
  type TenantPlan,
  type PlanStatus,
} from './billing/planFeatures';

/**
 * Minimal "request-like" shape that both Next API routes (`NextApiRequest`)
 * and `getServerSideProps` (`IncomingMessage`) satisfy. Used by the public /
 * user-level resolvers below since they only inspect `req.headers`.
 */
type RequestLike =
  | NextApiRequest
  | IncomingMessage
  | { headers: Record<string, string | string[] | undefined> };

/**
 * Default tenant UUID — the "conference" tenant, hardcoded as a safety net
 * so the API keeps working even if the env var is unset on a freshly
 * provisioned environment. Mirrors the row in the `tenants` table.
 */
export const DEFAULT_TENANT_ID: string =
  process.env.DEFAULT_TENANT_ID ?? 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

/**
 * RFC 4122 UUID matcher. Accepts any version (v1-v5) but the bot is expected
 * to send v4. Case-insensitive.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the tenant id for a bot request.
 *
 * - Valid `x-tenant-id` UUID header → returned as-is (lower-cased for
 *   normalisation downstream).
 * - Missing header → `DEFAULT_TENANT_ID` (no warning, expected during V1).
 * - Malformed header → `DEFAULT_TENANT_ID` + warn log (likely client bug).
 *
 * No DB lookup here — we don't yet validate that the tenant row exists.
 * That check moves in with Phase 3 / S6.
 */
export function resolveTenantId(req: NextApiRequest): string {
  const raw = req.headers['x-tenant-id'];
  const header = Array.isArray(raw) ? raw[0] : raw;

  if (header === undefined || header === null || header === '') {
    return DEFAULT_TENANT_ID;
  }

  if (typeof header !== 'string') {
    logger.warn(
      '[bot/tenant] x-tenant-id header is not a string, falling back to DEFAULT_TENANT_ID',
      { received: typeof header }
    );
    return DEFAULT_TENANT_ID;
  }

  if (!UUID_RE.test(header)) {
    logger.warn(
      '[bot/tenant] x-tenant-id header is not a valid UUID, falling back to DEFAULT_TENANT_ID',
      { received: header }
    );
    return DEFAULT_TENANT_ID;
  }

  return header.toLowerCase();
}

/* -----------------------------------------------------------------------
 * Existence / appartenance : tenant actif, et tenant d'un guild Discord
 * -----------------------------------------------------------------------
 *
 * Deux lookups minuscules mais appelés très souvent (chaque requête du bot,
 * chaque ouverture de ticket) : on les cache 60 s, positifs ET négatifs.
 */

const TENANT_LOOKUP_TTL_MS = 60_000;
const activeTenantCache = new Map<
  string,
  { active: boolean; expiresAt: number }
>();
const guildTenantCache = new Map<
  string,
  { tenantId: string | null; expiresAt: number }
>();

/** Purge les caches d'existence. Usage strictement test. */
export function __resetTenantLookupCachesForTests(): void {
  activeTenantCache.clear();
  guildTenantCache.clear();
}

/** Le tenant existe-t-il et est-il actif ? */
export async function isActiveTenantId(tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  const now = Date.now();
  const cached = activeTenantCache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.active;

  if (!supabaseAdmin) return false;
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, is_active')
    .eq('id', tenantId)
    .maybeSingle();

  // Erreur transitoire : on refuse sans cacher, pour ne pas figer un faux
  // négatif pendant une minute.
  if (error) {
    logger.error('[tenant] active tenant lookup failed', error);
    return false;
  }

  const active =
    !!data && (data as { is_active?: boolean }).is_active !== false;
  activeTenantCache.set(tenantId, {
    active,
    expiresAt: now + TENANT_LOOKUP_TTL_MS,
  });
  return active;
}

/**
 * Résolution guilde → tenant, en distinguant « guilde non liée » d'un ÉCHEC de
 * lecture.
 *
 * POURQUOI CETTE DISTINCTION — audit du 2026-09-12. Les deux cas rendaient
 * `null`, et les appelants en concluaient « guilde inconnue », ce qui les fait
 * retomber sur l'en-tête `x-tenant-id`. Or le principe posé ici est que la
 * GUILDE L'EMPORTE sur l'en-tête, parce qu'elle est une donnée que nous
 * possédons là où l'en-tête n'est qu'une affirmation du client. Une simple
 * erreur de lecture inversait donc cette précédence, et pouvait attribuer une
 * action au mauvais espace.
 */
export type GuildTenantLookup =
  | { ok: true; tenantId: string | null }
  | { ok: false; error: string };

export async function resolveGuildTenant(
  guildId: string
): Promise<GuildTenantLookup> {
  if (!guildId) return { ok: true, tenantId: null };
  const now = Date.now();
  const cached = guildTenantCache.get(guildId);
  if (cached && cached.expiresAt > now) {
    return { ok: true, tenantId: cached.tenantId };
  }

  if (!supabaseAdmin) {
    return { ok: false, error: 'supabase_admin_unavailable' };
  }
  const { data, error } = await supabaseAdmin
    .from('discord_guilds')
    .select('tenant_id')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (error) {
    logger.error('[tenant] guild → tenant lookup failed', error);
    return { ok: false, error: error.message };
  }

  const tenantId = (data as { tenant_id?: string } | null)?.tenant_id ?? null;
  guildTenantCache.set(guildId, {
    tenantId,
    expiresAt: now + TENANT_LOOKUP_TTL_MS,
  });
  return { ok: true, tenantId };
}

/* -----------------------------------------------------------------------
 * Public + user-level resolvers (S5c → S7a)
 * -----------------------------------------------------------------------
 *
 * Deux résolveurs publics :
 *
 *   - `resolveTenantIdForPublicRequest(req)` — **sync**, legacy. Renvoie
 *     toujours `DEFAULT_TENANT_ID`. Utilisé par les ~45 call sites
 *     historiques (API handlers + getServerSideProps mono-tenant). NE PAS
 *     casser cette signature tant que toutes les pages legacy n'ont pas
 *     migré vers la version path-prefix (cf. liste TODO en tête de fichier).
 *
 *   - `resolveTenantIdForPublicRequestAsync(req)` — **async**, path-prefix.
 *     Extrait le 1er segment du path, lookup `tenants.slug → tenants.id`,
 *     cache 60s. Fallback `DEFAULT_TENANT_ID` si pas de prefix / slug
 *     inconnu. C'est ce que les nouvelles pages `pages/[tenantSlug]/...`
 *     doivent utiliser.
 *
 *   - `getTenantIdBySlug(slug)` — primitive bas-niveau exposée pour les
 *     pages qui veulent décider d'un 404 si le slug ne matche pas (utile
 *     dans `getServerSideProps` de `pages/[tenantSlug]/tournois.tsx`).
 *
 * Les requêtes JOUEUSE authentifiées ont leur propre résolveur,
 * `resolvePlayerTenant` (plus bas) : ne pas leur appliquer ceux-ci.
 */

/* -----------------------------------------------------------------------
 * Tenant slug cache (in-memory, TTL 60s)
 * ----------------------------------------------------------------------- */

type TenantSlugCacheEntry = {
  tenantId: string | null; // null = slug confirmé inconnu (negative cache)
  expiresAt: number; // ms epoch
};

const TENANT_SLUG_CACHE_TTL_MS = 60_000;

/**
 * Map slug → { tenantId, expiresAt }. Module-scope = process-wide.
 *
 * Choix `Map` plutôt que `WeakMap` : les clés sont des strings (pas
 * GC-able via WeakMap) et on veut une éviction par TTL, pas par GC. Le set
 * de tenants change rarement (création manuelle via admin), un TTL de 60s
 * est un bon compromis fraîcheur / latence.
 *
 * Pas de pruning actif : un entry expiré est simplement ignoré à la
 * lecture. Si le set grossit sans limite (improbable, on parle d'une
 * dizaine de tenants max), il faudra ajouter un LRU.
 *
 * Exporté pour `__resetTenantSlugCacheForTests` (utilisé en unit tests).
 */
const tenantSlugCache = new Map<string, TenantSlugCacheEntry>();

/**
 * Reset le cache. À usage strictement test.
 *
 * Vide aussi les caches WHITELABEL (host → tenant_id et tenant_id → branding)
 * introduits plus bas, pour que les suites qui l'appellent en `beforeEach`
 * repartent d'un état propre.
 */
export function __resetTenantSlugCacheForTests(): void {
  tenantSlugCache.clear();
  tenantHostCache.clear();
  tenantBrandingCache.clear();
}

/**
 * Oublie la correspondance host → espace, en production.
 *
 * Appelé quand un domaine propre change d'état (vérifié, refusé, retiré) :
 * sans ça, un domaine fraîchement vérifié resterait ignoré jusqu'à expiration
 * du cache, et l'admin conclurait que la vérification n'a rien fait.
 *
 * Portée : l'instance courante — les autres attendront leur TTL.
 */
export function invalidateTenantHostCache(): void {
  tenantHostCache.clear();
  tenantBrandingCache.clear();
}

const SLUG_RE = /^[a-z0-9-]+$/;
const RESERVED_PATH_SEGMENTS = new Set([
  'api',
  '_next',
  'admin',
  'auth',
  'static',
  'public',
]);

/**
 * Lookup `tenants.slug → tenants.id`. Cache 60s.
 *
 * Renvoie `null` si :
 *   - slug invalide (format),
 *   - tenant inexistant,
 *   - tenant `is_active = false`,
 *   - `supabaseAdmin` indisponible (env mal configurée — log + null).
 */
export async function getTenantIdBySlug(slug: string): Promise<string | null> {
  if (!slug || !SLUG_RE.test(slug)) return null;

  const now = Date.now();
  const cached = tenantSlugCache.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.tenantId;
  }

  if (!supabaseAdmin) {
    logger.warn(
      '[tenant] supabaseAdmin unavailable, cannot resolve tenant slug',
      { slug }
    );
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    logger.warn('[tenant] failed to resolve slug', {
      slug,
      error: error.message,
    });
    return null;
  }

  const row = data as { id?: string; is_active?: boolean } | null;
  const tenantId =
    row && row.is_active !== false && typeof row.id === 'string'
      ? row.id
      : null;

  tenantSlugCache.set(slug, {
    tenantId,
    expiresAt: now + TENANT_SLUG_CACHE_TTL_MS,
  });

  return tenantId;
}

/**
 * Extrait le 1er segment du path. Retourne `null` si :
 *   - pas d'url,
 *   - 1er segment vide / réservé (api, _next, admin, …),
 *   - segment ne ressemble pas à un slug (format).
 */
function extractTenantSlugFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  // strip query/hash
  const pathOnly = url.split(/[?#]/, 1)[0] ?? url;
  const trimmed = pathOnly.replace(/^\/+/, '');
  if (!trimmed) return null;
  const first = trimmed.split('/', 1)[0]?.toLowerCase() ?? '';
  if (!first || RESERVED_PATH_SEGMENTS.has(first)) return null;
  if (!SLUG_RE.test(first)) return null;
  return first;
}

/**
 * Résout le tenant pour une requête publique (anon, pas de session).
 *
 * Version SYNC, legacy. Renvoie toujours `DEFAULT_TENANT_ID`. Utilisée par
 * tous les call sites historiques (~45 fichiers en `pages/api/*` et
 * quelques `getServerSideProps`) qui ne sont pas encore path-prefix.
 *
 * Pour le path-prefix multi-tenant, utiliser
 * `resolveTenantIdForPublicRequestAsync` (async, lookup DB) ou
 * `getTenantIdBySlug` (primitive bas-niveau, pour 404).
 *
 * Accepte aussi bien un `NextApiRequest` (handlers `/pages/api/*`) qu'un
 * `IncomingMessage` (le `req` exposé par `getServerSideProps`).
 */
export function resolveTenantIdForPublicRequest(_req: RequestLike): string {
  // TODO(S7) : à terme cette fonction sera supprimée au profit de
  // `resolveTenantIdForPublicRequestAsync`. Pour l'instant on garde le
  // fallback mono-tenant pour ne pas casser les 45 call sites legacy.
  return DEFAULT_TENANT_ID;
}

/**
 * Résolveur public ASYNCHRONE — celui qu'utilisent les routes d'API.
 *
 * Trois signaux, du plus fort au plus explicite : domaine propre, préfixe de
 * chemin, puis `?tenant=<slug>`. Aucun ne correspondant → espace historique,
 * ce qui préserve le comportement du site de l'association.
 *
 * Cache mémoire 60s sur le mapping slug → tenant_id (voir
 * `tenantSlugCache`).
 */
export async function resolveTenantIdForPublicRequestAsync(
  req: RequestLike
): Promise<string> {
  // 1) Domaine propre (`tenants.custom_domain`). Aucun espace n'en sert de
  //    pages aujourd'hui — le site public reste celui de l'association — mais
  //    une requête d'API arrivant sur un tel domaine appartient sans ambiguïté
  //    à son espace.
  const host = (req.headers as Record<string, unknown>)?.host;
  const byHost = await resolveTenantByHostResult(
    Array.isArray(host) ? host[0] : (host as string | undefined)
  );
  if (!byHost.ok) {
    // ÉCHEC DE LECTURE ≠ hôte inconnu. Poursuivre la cascade la ferait finir
    // sur `DEFAULT_TENANT_ID` : la requête d'un espace serait servie avec les
    // données de l'association — « valide, et fausse », comme le dit le point 3
    // ci-dessous. On préfère une erreur franche, que la route traduira en 5xx
    // et que l'appelant réessaiera.
    //
    // Chemin étroit par construction : la lecture n'a lieu que pour un hôte
    // ÉTRANGER (ni owwomenscup.fr, ni *.netlify.app, ni localhost), donc jamais
    // pour le trafic normal ni pour les previews.
    throw new Error(`tenant_host_lookup_failed: ${byHost.error}`);
  }
  if (byHost.tenantId) return byHost.tenantId;

  const url = (req as { url?: string }).url;

  // 2) Préfixe de chemin (`/cup-estivale/...`). Reconnu par héritage ; il n'y
  //    a pas de pages d'espace, donc ce chemin ne se présente en pratique que
  //    sur des URL construites à la main.
  const slug = extractTenantSlugFromUrl(url);
  if (slug) {
    const tenantId = await getTenantIdBySlug(slug);
    if (tenantId) return tenantId;
  }

  // 3) Paramètre `?tenant=<slug>` — LE mécanisme prévu pour l'API publique
  //    anonyme. Sans lui, un espace qui interroge /api/public/v1/tournaments
  //    recevrait les tournois de l'association : la réponse serait valide, et
  //    fausse. (L'API authentifiée, elle, tient son tenant de sa clé.)
  const tenantParam = extractTenantQueryParam(url);
  if (tenantParam) {
    const tenantId = await getTenantIdBySlug(tenantParam);
    if (tenantId) return tenantId;
  }

  return DEFAULT_TENANT_ID;
}

/** Valeur de `?tenant=` dans une URL brute, si elle ressemble à un slug. */
function extractTenantQueryParam(url: string | undefined): string | null {
  if (!url) return null;
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return null;
  const params = new URLSearchParams(url.slice(qIndex + 1));
  const raw = params.get('tenant');
  if (!raw) return null;
  const slug = raw.toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

/* ===========================================================================
 * Résolveur JOUEUSE — l'espace d'une requête authentifiée (lot 10)
 * ===========================================================================
 *
 * UN SEUL résolveur pour toutes les routes où une joueuse (ou une capitaine,
 * une manager) agit en son nom : `pages/api/player/**`, `pages/api/teams/**`,
 * `pages/api/demandes/**`, et `withSubjectRoute`.
 *
 * POURQUOI — audit du lot 10 (2026-09-17). Il en existait deux :
 *   - une version SYNCHRONE qui ignorait ses arguments et rendait toujours
 *     `DEFAULT_TENANT_ID` (`TODO(S7)`). ~37 routes en dépendaient — report de
 *     score, pronostics, les 14 routes TCG, profil, tableau de bord… Dès qu'un
 *     second espace a de vraies joueuses, une joueuse de l'espace B écrivait
 *     ses pronostics, ses pièces et ses paquets DANS L'ESPACE A, et apparaissait
 *     dans ses classements ;
 *   - une version ASYNCHRONE qui lisait `team_members … .limit(1)` SANS ORDRE :
 *     une joueuse membre d'équipes dans deux espaces obtenait l'un ou l'autre
 *     d'une requête à l'autre, au gré du plan d'exécution de Postgres — pire
 *     qu'un défaut fixe, parce qu'indétectable.
 * La version synchrone est supprimée : une résolution d'espace qui ne lit rien
 * ne peut pas être juste, et la garder invitait à la réutiliser.
 *
 * ORDRE DE RÉSOLUTION (décidé par la responsable, du plus explicite au repli) :
 *
 *   1. L'ÉQUIPE ACTIVE — `?teamId=` (posé par `withTeam()`, cf.
 *      `components/player/ActiveTeamContext.tsx` ; les routes
 *      `/api/teams/[teamId]/...` fournissent la même clé par leur segment).
 *      Retenue SEULEMENT si la joueuse est membre de l'équipe (ligne
 *      `team_members`) ou sa capitaine (`teams.captain_id`) : un paramètre
 *      n'est pas une preuve, et sans cette garde n'importe qui écrirait dans
 *      n'importe quel espace en changeant un identifiant d'URL. Paramètre
 *      invalide ou non prouvé → ignoré, on passe à l'étape suivante.
 *
 *   2. LE DOMAINE PROPRE de l'espace (`tenants.custom_domain`, vérifié, actif,
 *      plan white-label — cf. `resolveTenantByHostResult`). Rien d'autre à
 *      cette étape, et en particulier PAS le repli sur l'espace par défaut : sur
 *      owwomenscup.fr, qui n'est le domaine propre de personne, on continue.
 *      Les deux autres signaux du résolveur public sont VOLONTAIREMENT exclus :
 *        - le préfixe de chemin ne peut pas s'appliquer — `api` est un segment
 *          réservé, et sur une page SSR le premier segment est un nom de page
 *          (`/team/...`), pas un espace ;
 *        - `?tenant=<slug>` est une affirmation du client, qu'aucun écran
 *          joueuse n'envoie (vérifié le 2026-09-17). Classé AVANT l'appartenance,
 *          il laisserait une joueuse écrire dans l'espace de son choix.
 *
 *   3. UNE APPARTENANCE D'ÉQUIPE choisie de façon STABLE : la plus ancienne
 *      (`team_members.created_at`), puis `tenant_id`, puis `team_id` pour
 *      départager. Deux requêtes identiques rendent toujours le même espace.
 *      (Inspection staff : si l'une des appartenances est dans l'espace actif
 *      du staff, c'est elle — cf. `preferTenantId` et `utils/subject.ts`.)
 *
 *   4. Sinon, `DEFAULT_TENANT_ID`.
 *
 * ÉCHEC DE LECTURE ≠ ABSENCE DE SIGNAL. Une erreur Supabase à l'étape 1, 2 ou 3
 * LÈVE `TenantResolutionError` au lieu de retomber sur l'espace par défaut :
 * sinon une panne transitoire attribuerait l'écriture d'une joueuse de B à
 * l'espace A — « valide, et fausse », même raisonnement que l'audit du
 * 2026-09-12 sur le résolveur public. Les routes sont enveloppées par
 * `withAuthRoute`, qui traduit l'exception en 500 : l'écran réessaie.
 * (L'ancienne version asynchrone avalait l'erreur ; c'est un changement
 * assumé.)
 *
 * COÛT. Une lecture `team_members` indexée (`user_id`) par requête, qui sert à
 * la fois l'étape 1 et l'étape 3. S'y ajoutent, rarement : une lecture `teams`
 * quand `?teamId=` ne correspond à aucune appartenance (capitaine sans ligne
 * membre, ou paramètre périmé), et la lecture des domaines propres — jamais
 * sur owwomenscup.fr, les previews ni localhost, cachée 60 s ailleurs.
 * Le résultat est MÉMOÏSÉ PAR REQUÊTE (WeakMap sur l'objet `req`) : une route
 * qui résout deux fois ne relit pas. Pas au-delà de la requête — une joueuse
 * peut changer d'équipe entre deux appels.
 */

/** D'où vient l'espace retenu — exposé pour les tests et l'inspection staff. */
export type PlayerTenantSource =
  | 'active_team'
  | 'custom_domain'
  | 'membership'
  | 'default';

export type PlayerTenantResolution = {
  tenantId: string;
  source: PlayerTenantSource;
};

/**
 * Lecture impossible pendant la résolution. Distincte d'une erreur métier pour
 * qu'un appelant qui voudrait la traduire autrement qu'en 500 puisse la
 * reconnaître.
 */
export class TenantResolutionError extends Error {
  constructor(
    step: 'active_team' | 'custom_domain' | 'membership',
    detail: string
  ) {
    super(`tenant_resolution_failed(${step}): ${detail}`);
    this.name = 'TenantResolutionError';
  }
}

type MembershipRow = {
  team_id: string | null;
  tenant_id: string | null;
  created_at: string | null;
};

/**
 * `?teamId=` d'une requête, validé en UUID.
 *
 * Lit `req.query` (routes d'API, segment dynamique compris) puis, à défaut,
 * l'URL brute (`IncomingMessage` d'un `getServerSideProps`, qui n'a pas de
 * `query`). Même tolérance que `readRequestedTeamId` : une valeur invalide est
 * une absence, pas une erreur. Pas d'import de `utils/teams/teamScope` : il
 * importe ce module, la boucle ferait échouer l'initialisation.
 */
function readActiveTeamParam(req: RequestLike): string | null {
  const query = (req as { query?: Record<string, unknown> }).query;
  let raw: unknown = query?.[TEAM_SCOPE_QUERY_PARAM];
  if (raw === undefined) {
    const url = (req as { url?: string }).url;
    const qIndex = url ? url.indexOf('?') : -1;
    if (url && qIndex !== -1) {
      raw =
        new URLSearchParams(url.slice(qIndex + 1)).get(
          TEAM_SCOPE_QUERY_PARAM
        ) ?? undefined;
    }
  }
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * Mémo PAR REQUÊTE. La clé faible est l'objet `req` lui-même : l'entrée meurt
 * avec la requête, sans purge ni TTL — c'est exactement la durée voulue.
 * La clé interne distingue la joueuse résolue (soi-même ou sujet inspecté) et
 * la préférence d'espace, qui changent le résultat.
 */
const perRequestResolution = new WeakMap<
  object,
  Map<string, Promise<PlayerTenantResolution>>
>();

/**
 * Résout l'espace d'une requête joueuse, avec la source retenue.
 *
 * `ctx.authUserId` = la joueuse DONT on résout l'espace : l'appelante, ou la
 * joueuse inspectée quand un staff utilise `?as=` (jamais le staff).
 * `ctx.preferTenantId` = départage de l'étape 3 : si l'une des appartenances
 * est dans cet espace, elle l'emporte sur la plus ancienne.
 */
export function resolvePlayerTenant(
  req: RequestLike,
  ctx?: { authUserId?: string | null; preferTenantId?: string | null } | null
): Promise<PlayerTenantResolution> {
  const key = `${ctx?.authUserId ?? ''}|${ctx?.preferTenantId ?? ''}`;
  let byKey = perRequestResolution.get(req as object);
  if (!byKey) {
    byKey = new Map();
    perRequestResolution.set(req as object, byKey);
  }
  const cached = byKey.get(key);
  if (cached) return cached;
  const pending = computePlayerTenant(req, ctx ?? {});
  byKey.set(key, pending);
  return pending;
}

async function computePlayerTenant(
  req: RequestLike,
  ctx: { authUserId?: string | null; preferTenantId?: string | null }
): Promise<PlayerTenantResolution> {
  const authUserId = ctx.authUserId || null;

  // Les appartenances servent aux étapes 1 ET 3 : une seule lecture, faite au
  // premier besoin. Sur un domaine propre sans `?teamId=`, elle n'a pas lieu.
  let memberships: MembershipRow[] | null = null;
  const loadMemberships = async (): Promise<MembershipRow[]> => {
    if (memberships) return memberships;
    if (!authUserId) return (memberships = []);
    if (!supabaseAdmin) {
      throw new TenantResolutionError(
        'membership',
        'supabase_admin_unavailable'
      );
    }
    const { data, error } = await supabaseAdmin
      .from('team_members')
      .select('team_id, tenant_id, created_at')
      .eq('user_id', authUserId)
      // L'ORDRE EST LE CONTRAT de l'étape 3 : sans lui, « la première ligne »
      // est celle que le plan d'exécution rend, et elle peut changer.
      .order('created_at', { ascending: true })
      .order('tenant_id', { ascending: true })
      .order('team_id', { ascending: true });
    if (error) throw new TenantResolutionError('membership', error.message);
    return (memberships = (data as MembershipRow[] | null) ?? []);
  };

  // 1) Équipe active, si la joueuse en est membre ou capitaine.
  const activeTeamId = authUserId ? readActiveTeamParam(req) : null;
  if (activeTeamId) {
    const rows = await loadMemberships();
    const member = rows.find(
      (r) => r.team_id?.toLowerCase() === activeTeamId && r.tenant_id
    );
    if (member?.tenant_id) {
      return { tenantId: member.tenant_id, source: 'active_team' };
    }
    // Capitaine sans ligne `team_members` : cas hérité, mais c'est bien
    // « gestionnaire de l'équipe ». Une lecture de plus, seulement ici.
    if (!supabaseAdmin) {
      throw new TenantResolutionError(
        'active_team',
        'supabase_admin_unavailable'
      );
    }
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('tenant_id')
      .eq('id', activeTeamId)
      .eq('captain_id', authUserId as string)
      .maybeSingle();
    if (error) throw new TenantResolutionError('active_team', error.message);
    const captainTenant = (data as { tenant_id?: string | null } | null)
      ?.tenant_id;
    if (typeof captainTenant === 'string' && captainTenant) {
      return { tenantId: captainTenant, source: 'active_team' };
    }
    // Non prouvé : ignoré, sans erreur — un choix mémorisé périmé (équipe
    // quittée) ne doit pas casser l'écran.
  }

  // 2) Domaine propre, et rien d'autre (cf. en-tête).
  const host = (req.headers as Record<string, unknown>)?.host;
  const byHost = await resolveTenantByHostResult(
    Array.isArray(host) ? host[0] : (host as string | undefined)
  );
  if (!byHost.ok) {
    throw new TenantResolutionError('custom_domain', byHost.error);
  }
  if (byHost.tenantId) {
    return { tenantId: byHost.tenantId, source: 'custom_domain' };
  }

  // 3) Appartenance stable. Les lignes sans `tenant_id` ne portent aucun
  //    signal (données antérieures à la colonne) : on les saute.
  const rows = (await loadMemberships()).filter(
    (r): r is MembershipRow & { tenant_id: string } =>
      typeof r.tenant_id === 'string' && r.tenant_id !== ''
  );
  const preferred = ctx.preferTenantId
    ? rows.find((r) => r.tenant_id === ctx.preferTenantId)
    : undefined;
  const chosen = preferred ?? rows[0];
  if (chosen) return { tenantId: chosen.tenant_id, source: 'membership' };

  // 4) Aucun signal.
  return { tenantId: DEFAULT_TENANT_ID, source: 'default' };
}

/**
 * L'espace d'une requête joueuse — l'identifiant seul.
 *
 * Nom conservé pour les ~30 appelants existants ; la règle complète est dans
 * l'en-tête ci-dessus et dans `resolvePlayerTenant`. Lève
 * `TenantResolutionError` sur une lecture impossible.
 */
export async function resolveTenantIdForUserRequestAsync(
  req: RequestLike,
  ctx?: { authUserId?: string | null } | null
): Promise<string> {
  const { tenantId } = await resolvePlayerTenant(req, {
    authUserId: ctx?.authUserId ?? null,
  });
  return tenantId;
}

/* ===========================================================================
 * WHITELABEL — custom-domain resolution + per-tenant branding (S8)
 * ===========================================================================
 *
 * Le site est mono-tenant "par défaut" : logo `/img/logos/2026-logo.png`, nom
 * "OW Women's Cup", tokens `:root` statiques. Le whitelabel est une couche
 * d'OVERRIDE : quand une requête arrive sur un `custom_domain` connu, on lit
 * le branding du tenant (logo, couleurs, nom) et on l'injecte au SSR (cf.
 * `pages/_document.tsx`). En l'absence de custom-domain / de branding, on ne
 * renvoie RIEN et le rendu reste byte-identique au défaut historique.
 *
 * Deux caches mémoire (TTL 60s, negative caching) sur le même modèle que
 * `tenantSlugCache` :
 *   - `tenantHostCache`     : host normalisé → tenant_id | null
 *   - `tenantBrandingCache` : tenant_id      → TenantBranding | null
 */

/**
 * Branding public d'un tenant. `name` est toujours renseigné (fallback slug) ;
 * les autres champs sont `null` quand le tenant ne les a pas définis, auquel
 * cas le consommateur retombe sur sa constante par défaut.
 */
export type TenantBranding = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  slug: string;
};

type TenantHostCacheEntry = {
  tenantId: string | null; // null = host confirmé sans tenant (negative cache)
  expiresAt: number;
};

type TenantBrandingCacheEntry = {
  branding: TenantBranding | null; // null = pas de branding custom (défaut)
  expiresAt: number;
};

const tenantHostCache = new Map<string, TenantHostCacheEntry>();
const tenantBrandingCache = new Map<string, TenantBrandingCacheEntry>();

/**
 * Couleur hex stricte (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`). Garde-fou
 * ANTI-INJECTION : ces valeurs sont interpolées dans un `<style>` inline au
 * SSR — on refuse tout ce qui n'est pas un hex pur pour empêcher une évasion
 * de contexte CSS (`}...{`, `url(...)`, etc.).
 */
const HEX_COLOR_RE =
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function sanitizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed : null;
}

/**
 * Autorise un chemin racine (`/img/...`) ou une URL https absolue. On refuse
 * http/data:/javascript: — le logo est rendu via `next/image`/`<img>` et
 * l'`img-src` CSP n'autorise que `'self' data: blob: https:`. Les logos
 * custom sont attendus sur le storage Supabase (`**.supabase.co`, déjà dans
 * `next.config.js#images.remotePatterns`).
 */
function sanitizeLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return null;
}

/**
 * Normalise un host : trim, lowercase, retrait du port et du point final.
 * Retourne `null` si vide. Ne gère pas les IPv6 littéraux entre crochets
 * (non pertinent pour un custom_domain).
 */
function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  let h = host.trim().toLowerCase();
  if (!h) return null;
  // Strip port (ex: "exemple.fr:3000" → "exemple.fr"). On ignore les IPv6
  // bracketés (présence de "]") pour ne pas tronquer une adresse.
  const colonIdx = h.lastIndexOf(':');
  if (colonIdx !== -1 && !h.includes(']')) h = h.slice(0, colonIdx);
  h = h.replace(/\.$/, ''); // FQDN trailing dot
  return h || null;
}

/**
 * Host propre à la plateforme (domaine « officiel » OW Women's Cup, previews
 * Netlify, dev local). Sur ces hosts on ne résout AUCUN tenant custom : le
 * défaut historique s'applique. Évite un lookup DB inutile à chaque requête
 * sur le domaine principal.
 */
function isPlatformDefaultHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return true;
  }
  // Previews / branches Netlify (*.netlify.app) = plateforme, jamais un tenant.
  if (host.endsWith('.netlify.app')) return true;

  const defaults = new Set<string>(['owwomenscup.fr', 'www.owwomenscup.fr']);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl).hostname.toLowerCase();
      if (parsed) {
        defaults.add(parsed);
        defaults.add(
          parsed.startsWith('www.') ? parsed.slice(4) : `www.${parsed}`
        );
      }
    } catch {
      // NEXT_PUBLIC_SITE_URL mal formée → on ignore, les défauts hardcodés
      // suffisent.
    }
  }
  return defaults.has(host);
}

/**
 * Résout le tenant.id à partir du host de la requête (custom domain).
 *
 * - Host vide / plateforme (owwomenscup.fr, *.netlify.app, localhost) →
 *   `{ ok: true, tenantId: null }` (aucun lookup, défaut appliqué).
 * - Host = `custom_domain` d'un tenant ACTIF → son tenant.id.
 * - Host inconnu → `{ ok: true, tenantId: null }` (negative cache).
 * - Lecture IMPOSSIBLE → `{ ok: false }`.
 *
 * POURQUOI CE TROISIÈME CAS — audit du 2026-09-12. La fonction rendait `null`
 * aussi bien pour « hôte inconnu » que pour « je n'ai pas pu lire », et son
 * appelant termine sa cascade par `DEFAULT_TENANT_ID` : une erreur de lecture
 * transitoire faisait donc servir les données de l'association à la requête
 * d'un autre espace. Le commentaire du point 3 de cette cascade décrit
 * exactement le résultat : « la réponse serait valide, et fausse ».
 *
 * Comparaison case-insensitive côté JS (on récupère tous les tenants ayant un
 * `custom_domain` non nul — une poignée de lignes — puis on matche le host
 * normalisé), ce qui reste correct quelle que soit la casse stockée en base.
 * Cache mémoire 60s.
 */
export type HostTenantLookup =
  | { ok: true; tenantId: string | null }
  | { ok: false; error: string };

export async function resolveTenantByHostResult(
  host: string | null | undefined
): Promise<HostTenantLookup> {
  const norm = normalizeHost(host);
  // Hôte de la plateforme : on sort AVANT toute lecture. C'est ce qui rend le
  // cas d'échec ci-dessous très étroit — le trafic normal et les previews
  // Netlify n'interrogent jamais la base ici.
  if (!norm || isPlatformDefaultHost(norm)) return { ok: true, tenantId: null };

  const now = Date.now();
  const cached = tenantHostCache.get(norm);
  if (cached && cached.expiresAt > now) {
    return { ok: true, tenantId: cached.tenantId };
  }

  if (!supabaseAdmin) {
    logger.warn(
      '[tenant] supabaseAdmin unavailable, cannot resolve tenant by host',
      { host: norm }
    );
    return { ok: false, error: 'supabase_admin_unavailable' };
  }

  let tenantId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select(
        'id, custom_domain, custom_domain_state, is_active, plan, plan_status, plan_expires_at'
      )
      .not('custom_domain', 'is', null);

    if (error) {
      logger.warn('[tenant] failed to resolve host', {
        host: norm,
        error: error.message,
      });
      return { ok: false, error: error.message };
    }

    const rows =
      (data as
        | {
            id?: string;
            custom_domain?: string | null;
            custom_domain_state?: string | null;
            is_active?: boolean;
            plan?: string | null;
            plan_status?: string | null;
            plan_expires_at?: string | null;
          }[]
        | null) ?? [];
    const nowMs = Date.now();
    const match = rows.find(
      (r) =>
        typeof r.custom_domain === 'string' &&
        normalizeHost(r.custom_domain) === norm &&
        // Un domaine non VÉRIFIÉ ne route pas. Sans preuve de possession,
        // n'importe quel espace pouvait déclarer n'importe quel nom d'hôte et
        // se le voir router (T7).
        r.custom_domain_state === 'verified' &&
        r.is_active !== false &&
        typeof r.id === 'string' &&
        // Même règle que le branding : le domaine propre est une capacité
        // `whiteLabel`. Sans ce filtre, un espace au palier gratuit — ou un
        // plan payant expiré — gardait son domaine routé indéfiniment, alors
        // que sa marque, elle, était déjà retombée sur la marque partagée.
        tenantHasCapability(
          {
            plan: (r.plan ?? 'discovery') as TenantPlan,
            plan_status: (r.plan_status ?? 'active') as PlanStatus,
            plan_expires_at: r.plan_expires_at ?? null,
          },
          'whiteLabel',
          nowMs
        )
    );
    tenantId = match?.id ?? null;
  } catch (err) {
    logger.warn('[tenant] unexpected error resolving host', {
      host: norm,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  tenantHostCache.set(norm, {
    tenantId,
    expiresAt: now + TENANT_SLUG_CACHE_TTL_MS,
  });
  return { ok: true, tenantId };
}

/**
 * Variante confondante : erreur de lecture et hôte inconnu rendent tous deux
 * `null`.
 *
 * LÉGITIME LÀ OÙ LA DÉCISION EST LA MÊME dans les deux cas — `pages/_document`
 * s'en sert pour le branding, et une erreur y donne le branding par défaut,
 * exactement comme un hôte inconnu. NE PAS l'utiliser là où l'échec de lecture
 * changerait à QUI la requête est attribuée : c'est le rôle de
 * `resolveTenantByHostResult`.
 */
export async function resolveTenantIdByHost(
  host: string | null | undefined
): Promise<string | null> {
  const res = await resolveTenantByHostResult(host);
  return res.ok ? res.tenantId : null;
}

/**
 * Lit le branding public d'un tenant.
 *
 * Retourne `null` (→ défaut appliqué) quand :
 *   - `tenantId` est le tenant par défaut,
 *   - le tenant est introuvable / inactif,
 *   - AUCUN champ de branding n'est défini (logo + primary + accent tous
 *     vides) : sans override visuel, on laisse le rendu par défaut intact.
 *
 * Sinon renvoie le branding complet (avec `name`/`slug`). Les couleurs sont
 * sanitizées en hex strict ; le logo en chemin racine ou https. Cache 60s.
 */
export async function readTenantBranding(
  tenantId: string
): Promise<TenantBranding | null> {
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) return null;

  const now = Date.now();
  const cached = tenantBrandingCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    return cached.branding;
  }

  if (!supabaseAdmin) {
    logger.warn(
      '[tenant] supabaseAdmin unavailable, cannot read tenant branding',
      { tenantId }
    );
    return null;
  }

  let branding: TenantBranding | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select(
        'name, slug, logo_url, primary_color, accent_color, is_active, plan, plan_status, plan_expires_at'
      )
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      logger.warn('[tenant] failed to read branding', {
        tenantId,
        error: error.message,
      });
      return null; // erreur transitoire → ne pas cacher
    }

    const row = data as {
      name?: string | null;
      slug?: string | null;
      logo_url?: string | null;
      primary_color?: string | null;
      accent_color?: string | null;
      is_active?: boolean;
      plan?: string | null;
      plan_status?: string | null;
      plan_expires_at?: string | null;
    } | null;

    if (row && row.is_active !== false) {
      // Gate white-label (« Régie solidaire ») : le branding custom n'est
      // appliqué que si le tenant a la capacité `whiteLabel`. Le palier gratuit
      // `discovery` — et tout plan payant expiré / past_due, via effectivePlan —
      // retombe sur la marque partagée (branding null). Le flagship `foundation`
      // et les plans payants actifs (regie/circuit) gardent le leur.
      const canWhiteLabel = tenantHasCapability(
        {
          plan: (row.plan ?? 'discovery') as TenantPlan,
          plan_status: (row.plan_status ?? 'active') as PlanStatus,
          plan_expires_at: row.plan_expires_at ?? null,
        },
        'whiteLabel',
        now
      );

      if (canWhiteLabel) {
        const logoUrl = sanitizeLogoUrl(row.logo_url);
        const primaryColor = sanitizeHexColor(row.primary_color);
        const accentColor = sanitizeHexColor(row.accent_color);

        // Un override existe seulement si au moins un champ visuel est défini.
        if (logoUrl || primaryColor || accentColor) {
          const slug = typeof row.slug === 'string' ? row.slug : '';
          const name =
            typeof row.name === 'string' && row.name.trim()
              ? row.name.trim()
              : slug || "OW Women's Cup";
          branding = { name, slug, logoUrl, primaryColor, accentColor };
        }
      }
    }
  } catch (err) {
    logger.warn('[tenant] unexpected error reading branding', {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  tenantBrandingCache.set(tenantId, {
    branding,
    expiresAt: now + TENANT_SLUG_CACHE_TTL_MS,
  });
  return branding;
}
