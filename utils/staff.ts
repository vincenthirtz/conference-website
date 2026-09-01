// lib/staff.ts
/* Outils Staff : rôles, permissions, helpers SSR/API */
import type {
  NextApiRequest,
  NextApiResponse,
  GetServerSideProps,
  GetServerSidePropsContext,
} from 'next';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin, getServerClient } from './supabase';
import type { StaffRole } from '@/types/admin';
import {
  effectiveStaffPermissions,
  hasStaffPermission,
  type StaffPermission,
} from '@/utils/staffPermissions';
import type {
  StaffMember,
  StaffContext,
  AuthenticatedStaffContext,
} from '@/types/staff';
import type { TenantKind } from './tenantKind';

import { logger } from './logger';
export type { StaffRole } from '@/types/admin';
export type {
  StaffMember,
  StaffContext,
  AuthenticatedStaffContext,
} from '@/types/staff';

/* -----------------------------------------------------------
 * Types & constantes
 * ---------------------------------------------------------*/

export class StaffUnauthorizedError extends Error {
  statusCode = 403;
  constructor(message = 'Accès staff non autorisé') {
    super(message);
    this.name = 'StaffUnauthorizedError';
  }
}

export class StaffUnauthenticatedError extends Error {
  statusCode = 401;
  constructor(message = 'Utilisateur non authentifié') {
    super(message);
    this.name = 'StaffUnauthenticatedError';
  }
}

export const STAFF_ROLES: StaffRole[] = [
  'owner',
  'admin',
  'caster',
  'referee',
  'helper',
];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  caster: 'Caster',
  referee: 'Arbitre',
  helper: 'Bénévole',
};

export const STAFF_ROLE_DESCRIPTION: Record<StaffRole, string> = {
  owner: 'Accès complet, gestion du staff, gestion des permissions',
  admin: 'Accès complet au back-office, gestion tournois & résultats',
  caster: 'Accès lecture + meta info match (pour préparation cast)',
  referee: 'Le jour J, sur les matchs : check-in, scores, litiges',
  helper: 'Une seule tâche : tenir le check-in',
};

/**
 * Hiérarchie HISTORIQUE, conservée telle quelle pour les ~68 gardes existantes
 * (`withStaffPage('admin')`, `withStaffRoute(h, 'caster')`…).
 *
 * Les rôles du lot A2 sont volontairement SOUS `caster` (rang négatif) : un
 * ordre total ne sait pas exprimer « peut arbitrer mais pas caster ». Leur
 * accès passe donc exclusivement par les permissions
 * (`utils/staffPermissions.ts`), jamais par ce rang — dont le seul rôle ici est
 * de garantir qu'aucune garde héritée ne les laisse entrer par erreur.
 */
export const STAFF_ROLE_RANK: Record<StaffRole, number> = {
  owner: 2,
  admin: 1,
  caster: 0,
  referee: -1,
  helper: -1,
};

/* -----------------------------------------------------------
 * Helpers de base sur les rôles
 * ---------------------------------------------------------*/

export function formatStaffRoleLabel(role: StaffRole): string {
  return STAFF_ROLE_LABEL[role] ?? role;
}

export function getRoleLabel(role: StaffRole | null | undefined): string {
  if (!role) return '—';
  return STAFF_ROLE_LABEL[role] ?? role;
}

export function getRoleDescription(role: StaffRole | null | undefined): string {
  if (!role) return '';
  return STAFF_ROLE_DESCRIPTION[role] ?? '';
}

export function getRoleOptions() {
  return STAFF_ROLES.map((role) => ({
    value: role,
    label: STAFF_ROLE_LABEL[role],
    description: STAFF_ROLE_DESCRIPTION[role],
  }));
}

export function hasAtLeastRole(
  role: StaffRole | null | undefined,
  minRole: StaffRole
): boolean {
  if (!role) return false;
  return STAFF_ROLE_RANK[role] >= STAFF_ROLE_RANK[minRole];
}

/* -----------------------------------------------------------
 * Récupérer le staff d'un user (avec cache mémoire TTL 5 min)
 * ---------------------------------------------------------*/

const STAFF_CACHE_TTL = 5 * 60 * 1_000; // 5 minutes
const staffCache = new Map<
  string,
  { data: StaffMember | null; expiresAt: number }
>();

export async function getStaffByUserId(
  userId: string
): Promise<StaffMember | null> {
  const now = Date.now();
  const cached = staffCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const { data, error } = await supabaseAdmin
    .from('staff')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error('getStaffByUserId error:', error);
    return null;
  }

  // Soft-delete filtering : un staff is_active=false (ou deleted_at non-null,
  // pour les anciens enregistrements pré-migration) est traité comme s'il
  // n'existait pas → plus de droits. La row reste pour préserver l'audit
  // staff_logs.
  let result: StaffMember | null = (data as StaffMember) ?? null;
  if (result) {
    const r = result as StaffMember & {
      is_active?: boolean | null;
      deleted_at?: string | null;
    };
    if (r.is_active === false || r.deleted_at) {
      result = null;
    }
  }
  staffCache.set(userId, { data: result, expiresAt: now + STAFF_CACHE_TTL });
  return result;
}

/** Invalidate the staff cache for a specific user (call after role changes). */
export function invalidateStaffCache(userId?: string) {
  if (userId) {
    staffCache.delete(userId);
  } else {
    staffCache.clear();
  }
}

export async function getStaffRole(userId: string): Promise<StaffRole | null> {
  const staff = await getStaffByUserId(userId);
  return staff?.role ?? null;
}

/* -----------------------------------------------------------
 * Contexte staff côté serveur (SSR / API routes)
 * ---------------------------------------------------------*/

// Token → userId cache (60s). Évite un roundtrip réseau supabase.auth.getUser
// par appel d'API admin lors d'une même navigation utilisateur.
const TOKEN_CACHE_TTL = 60 * 1_000;
const tokenUserCache = new Map<
  string,
  { user: User | null; expiresAt: number }
>();

// Cookie header → user cache (60s). Sur les pages SSR admin, chaque navigation
// Next refait un `supabase.auth.getUser()` (roundtrip GoTrue) car la requête
// de données Next ne porte pas de header Bearer : on tombe alors dans la
// branche cookies ci-dessous, jusqu'ici non cachée — c'était le coût dominant
// de latence pour atteindre le back-office. On mémoïse par header cookie
// (même session = mêmes cookies) sur la même fenêtre que `tokenUserCache`.
const cookieUserCache = new Map<
  string,
  { user: User | null; expiresAt: number }
>();

// Éviction des caches user (token/cookie) : sans elle, les entrées expirées
// s'accumulent indéfiniment (chaque token rafraîchi / header cookie distinct
// crée une clé) → fuite mémoire lente. Stratégie simple et sûre : purge des
// entrées expirées au passage + cap de taille (suppression des plus
// anciennes, ordre d'insertion des Map).
const USER_CACHE_MAX_ENTRIES = 1000;

/** Exporté pour les tests unitaires. */
export function setUserCacheEntry<V extends { expiresAt: number }>(
  cache: Map<string, V>,
  key: string,
  value: V,
  maxEntries: number = USER_CACHE_MAX_ENTRIES
): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
  // Re-set de la clé en fin de Map (rafraîchit l'ordre d'insertion), puis cap.
  cache.delete(key);
  while (cache.size >= maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, value);
}

async function resolveUserFromToken(token: string): Promise<User | null> {
  const now = Date.now();
  const cached = tokenUserCache.get(token);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (error) {
      logger.error('resolveUserFromToken error:', error);
      setUserCacheEntry(tokenUserCache, token, {
        user: null,
        expiresAt: now + TOKEN_CACHE_TTL,
      });
      return null;
    }
    setUserCacheEntry(tokenUserCache, token, {
      user,
      expiresAt: now + TOKEN_CACHE_TTL,
    });
    return user;
  } catch (err) {
    logger.error('resolveUserFromToken exception:', err);
    return null;
  }
}

// Symbole privé pour mémoïser le contexte sur l'objet req durant la vie de la requête.
const STAFF_CTX_KEY = Symbol.for('ow.staffContext');

/**
 * - API routes : on lit le header Authorization: Bearer <token>
 * - Pages SSR : on tombe en fallback sur getServerClient (cookies Supabase si tu les ajoutes un jour)
 *
 * Memoize le résultat sur `req` pour éviter de refaire le travail si appelé
 * plusieurs fois durant le même cycle de requête (ex: middleware + handler).
 */
export async function getStaffContextFromRequest(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<StaffContext> {
  const reqWithCache = req as unknown as Record<symbol, unknown>;
  const memoized = reqWithCache[STAFF_CTX_KEY] as StaffContext | undefined;
  if (memoized) return memoized;

  let user: User | null = null;

  // 1) Essayer d'abord avec le token Bearer (cas API / fetch côté client)
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

  if (token) {
    user = await resolveUserFromToken(token);
  }

  // 2) Si pas de token ou pas d'user via token → fallback cookies / SSR
  if (!user) {
    const cookieHeader = req.headers.cookie || '';
    const now = Date.now();
    const cached = cookieHeader ? cookieUserCache.get(cookieHeader) : undefined;

    if (cached && cached.expiresAt > now) {
      user = cached.user;
    } else {
      const supabase = getServerClient(req, res);
      const {
        data: { user: cookieUser },
        error: cookieError,
      } = await supabase.auth.getUser();

      if (cookieError) {
        // On ignore les erreurs "Auth session missing" qui sont normales
        const msg = (cookieError as any)?.message || '';
        const status = (cookieError as any)?.status;

        const isMissingSession =
          msg.includes('Auth session missing') || status === 400;

        if (!isMissingSession) {
          logger.error('getStaffContextFromRequest cookie error:', cookieError);
        }
      }

      user = cookieUser ?? null;
      if (cookieHeader) {
        setUserCacheEntry(cookieUserCache, cookieHeader, {
          user,
          expiresAt: now + TOKEN_CACHE_TTL,
        });
      }
    }
  }

  // 3) Pas d'utilisateur → pas de contexte staff
  if (!user) {
    const empty: StaffContext = { user: null, staff: null, role: null };
    reqWithCache[STAFF_CTX_KEY] = empty;
    return empty;
  }

  // 4) Récupérer le staff correspondant
  const staff = await getStaffByUserId(user.id);

  const ctx: StaffContext = {
    user,
    staff,
    role: staff?.role ?? null,
  };
  reqWithCache[STAFF_CTX_KEY] = ctx;
  return ctx;
}

/**
 * Helper pour les API routes admin :
 * - Vérifie que l'utilisateur est connecté
 * - Vérifie qu'il a au moins le rôle demandé
 * - Retourne le StaffContext
 */
export async function requireStaffRoleFromRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  minRole: StaffRole
): Promise<AuthenticatedStaffContext> {
  const ctx = await getStaffContextFromRequest(req, res);

  if (!ctx.user) {
    throw new StaffUnauthenticatedError();
  }

  if (!ctx.role || !ctx.staff || !hasAtLeastRole(ctx.role, minRole)) {
    throw new StaffUnauthorizedError('Accès non autorisé');
  }

  // S7 : resolution du tenant actif via cookie `staff_active_tenant_id`,
  // fallback sur le premier tenant accessible (par slug ASC) puis sur
  // DEFAULT_TENANT_ID. La query DB cote `resolveActiveTenant` est minuscule
  // (tenant_staff est petit) — pas de cache pour V1.
  //
  // On passe `is_pole_admin` en hint pour eviter un re-SELECT cote
  // `resolveActiveTenant` / `canAccessTenant` : la row staff est deja
  // chargee ici via `getStaffByUserId` (cache 5min).
  //
  // Import dynamique pour eviter un cycle (`utils/adminTenants` reimporte
  // `hasAtLeastRole` depuis ce module).
  const { resolveActiveTenant, readActiveTenantCookie } =
    await import('./adminTenants');
  const cookieTenantId = readActiveTenantCookie(req.cookies);
  const isPoleAdmin = (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
  const { tenantId, source } = await resolveActiveTenant(
    ctx.staff.id,
    cookieTenantId,
    { isPoleAdmin }
  );

  return {
    user: ctx.user,
    staff: ctx.staff,
    role: ctx.role,
    tenantId,
    currentTenantSource: source,
  };
}

/**
 * Variante PAR PERMISSION de `requireStaffRoleFromRequest` (lot A2 de
 * docs/PLAN-espace-admin.md).
 *
 * Pourquoi une seconde garde plutôt qu'un `minRole` élargi : les rangs sont un
 * ordre TOTAL (« au moins admin »), les droits ne le sont pas. « Peut tenir le
 * check-in mais rien d'autre » n'a pas de place dans une échelle — il en a une
 * dans un catalogue.
 *
 * Le reste (session, tenant actif, contexte renvoyé) est strictement identique :
 * cette fonction délègue, elle ne réimplémente rien.
 */
export async function requireStaffPermissionFromRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  permission: StaffPermission
): Promise<AuthenticatedStaffContext> {
  // `helper` est le rôle le plus bas : cette première passe ne fait donc que
  // « est-ce un membre du staff authentifié ? » et résout le tenant actif.
  const ctx = await requireStaffRoleFromRequest(req, res, 'helper');

  // Deux sources : le rôle, et les permissions accordées à l'unité sur la
  // fiche staff. La seconde est ce qui permet de confier une tâche précise sans
  // donner un rôle entier — « le Drive de l'asso à la trésorière » sans faire
  // d'elle une administratrice du site.
  if (!hasStaffPermission(ctx.role, ctx.staff.extra_permissions, permission)) {
    throw new StaffUnauthorizedError(
      `Ce compte ne couvre pas la permission « ${permission} ».`
    );
  }
  // Le contexte retient PAR QUOI l'accès a été accordé : le journal peut alors
  // dire « à quel titre », ce qui compte dès que l'acteur peut être un renfort
  // d'un jour et non un administrateur.
  return { ...ctx, permission };
}

/* -----------------------------------------------------------
 * Helpers pratiques pour les API routes
 * ---------------------------------------------------------*/

/**
 * CSRF protection: for state-changing methods, verify the Origin or Referer
 * header matches the host to block cross-site form submissions.
 *
 * Exporté pour les routes à effet de bord qui n'utilisent pas withStaffRoute
 * (ex. /api/admin/logout, qui doit fonctionner même sans contexte staff).
 */
export function csrfCheck(req: NextApiRequest): boolean {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')
    return true;

  // Requests with a Bearer token are not browser-initiated, skip CSRF check
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return true;

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;
  if (!host) return false;

  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  // No origin or referer on a state-changing request → reject
  return false;
}

/**
 * Garde d'une route admin : un RÔLE MINIMUM (forme historique) ou une
 * PERMISSION (`{ permission: 'run_checkin' }`, lot A2).
 *
 * Les deux formes coexistent volontairement : migrer 68 pages d'un coup serait
 * un big bang, et la forme par rôle reste correcte pour tout ce qui est
 * réellement « le back-office entier ».
 */
export type StaffGuard = StaffRole | { permission: StaffPermission };

export function withStaffRoute(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse,
    ctx: AuthenticatedStaffContext
  ) => Promise<unknown>,
  guard: StaffGuard = 'admin'
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      if (!csrfCheck(req)) {
        res.status(403).json({ error: 'Forbidden: origin mismatch' });
        return;
      }
      const ctx =
        typeof guard === 'string'
          ? await requireStaffRoleFromRequest(req, res, guard)
          : await requireStaffPermissionFromRequest(req, res, guard.permission);
      await handler(req, res, ctx);
    } catch (err: unknown) {
      if (
        err instanceof StaffUnauthenticatedError ||
        err instanceof StaffUnauthorizedError
      ) {
        // Expected auth errors - no need to log
        res
          .status(err.statusCode || 401)
          .json({ error: (err as Error).message });
        return;
      }

      // Log only unexpected errors
      logger.error('withStaffRoute error:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  };
}

/**
 * Re-check owner-level à l'intérieur d'un handler dont le wrapper `withStaffRoute`
 * autorise un rôle inférieur (gating fin par méthode HTTP : GET ouvert à un rôle
 * bas, writes réservés à owner).
 *
 * Écrit une réponse 403 et retourne `false` si le contexte n'est pas owner,
 * `true` sinon. Usage : `if (!requireOwner(ctx, res)) return;`
 *
 * Centralise l'intention owner-only pour la rendre visible et testable de façon
 * homogène plutôt qu'enfouie dans un `if (!hasAtLeastRole(...))` répété par handler.
 */
export function requireOwner(
  ctx: { role: StaffRole | null },
  res: NextApiResponse
): boolean {
  if (!hasAtLeastRole(ctx.role, 'owner')) {
    res.status(403).json({ error: 'Forbidden.' });
    return false;
  }
  return true;
}

/**
 * Helper pour les API routes user-level (joueur, capitaine d'équipe) :
 * - Lit le header `Authorization: Bearer <token>`
 * - Résout l'utilisateur (avec cache token→user)
 * - 401 si token absent ou invalide
 * - Pas de check de rôle staff
 *
 * Bearer-only : l'authentification par Bearer est naturellement résistante au
 * CSRF (le navigateur n'attache pas l'header Authorization automatiquement
 * cross-origin), donc pas de check CSRF nécessaire. Pour une route qui doit
 * accepter les cookies SSR, garder l'auth manuelle via getServerClient.
 */
export function withAuthRoute(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse,
    ctx: { user: User }
  ) => Promise<unknown>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      if (!supabaseAdmin) {
        res.status(503).json({ error: 'Service unavailable.' });
        return;
      }

      const authHeader = req.headers.authorization;
      const token =
        authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.slice('Bearer '.length)
          : undefined;

      if (!token) {
        res.status(401).json({ error: 'Token required.' });
        return;
      }

      const user = await resolveUserFromToken(token);
      if (!user) {
        res.status(401).json({ error: 'Not authenticated.' });
        return;
      }

      await handler(req, res, { user });
    } catch (err: unknown) {
      logger.error('withAuthRoute error:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  };
}

/* -----------------------------------------------------------
 * Utils
 * ---------------------------------------------------------*/

export function isStaff(role: StaffRole | null | undefined) {
  return !!role;
}

export function isAdmin(role: StaffRole | null | undefined) {
  return hasAtLeastRole(role, 'admin');
}

export function isManagerOrAbove(role: StaffRole | null | undefined) {
  return hasAtLeastRole(role, 'admin');
}

type StaffPageLoader<P> = (
  ctx: GetServerSidePropsContext,
  staffCtx: AuthenticatedStaffContext
) => Promise<P> | P;

export function withStaffPage<
  P extends Record<string, unknown> = Record<string, unknown>,
>(
  guard: StaffGuard = 'admin',
  loader?: StaffPageLoader<P>
): GetServerSideProps {
  return async function (ctx: GetServerSidePropsContext) {
    const { req, res } = ctx;

    try {
      const staffCtx =
        typeof guard === 'string'
          ? await requireStaffRoleFromRequest(req as any, res as any, guard)
          : await requireStaffPermissionFromRequest(
              req as any,
              res as any,
              guard.permission
            );

      // Nature du tenant actif (organizer/developer) : sert à filtrer la nav
      // admin et les cartes du dashboard côté SSR. Fail-safe 'organizer' en cas
      // d'échec (jamais durcir accidentellement l'accès des tenants existants).
      const { getTenantKind } = await import('./tenantKind');
      let activeTenantKind: TenantKind = 'organizer';
      try {
        activeTenantKind = await getTenantKind(staffCtx.tenantId);
      } catch (e) {
        logger.error('withStaffPage getTenantKind error:', e);
      }

      const baseProps = {
        staff: {
          id: staffCtx.staff.id,
          // id du compte AUTH (≠ staff.id) : permet aux pages de reconnaître
          // « ma » ligne dans une liste d'utilisateurs et de neutraliser les
          // actions que l'API refuse de toute façon sur soi-même.
          auth_user_id: staffCtx.user.id,
          role: staffCtx.role,
          display_name: staffCtx.staff.display_name,
          // Permissions EFFECTIVES (rôle + accordées). Les pages en ont besoin
          // pour ne pas afficher un menu qui mène en 403 — le rôle seul ne
          // suffit plus depuis que des droits s'accordent à l'unité.
          permissions: effectiveStaffPermissions(
            staffCtx.role,
            staffCtx.staff.extra_permissions
          ),
        },
        activeTenantKind,
      };

      if (!loader) {
        return { props: baseProps };
      }

      const loaded = await loader(ctx, staffCtx);
      return { props: { ...baseProps, ...loaded } };
    } catch (err: unknown) {
      // Non connecté → redirection vers /admin/login
      if (err instanceof StaffUnauthenticatedError) {
        return {
          redirect: {
            destination: '/admin/login',
            permanent: false,
          },
        };
      }

      // Pas le rôle requis → 403
      if (err instanceof StaffUnauthorizedError) {
        return {
          redirect: {
            destination: '/403',
            permanent: false,
          },
        };
      }

      // Autre erreur → /500
      logger.error('withStaffPage error:', err);
      return {
        redirect: {
          destination: '/500',
          permanent: false,
        },
      };
    }
  };
}
