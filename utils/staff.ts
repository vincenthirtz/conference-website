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
import type { StaffMember, StaffContext } from '@/types/staff';

import { logger } from './logger';
export type { StaffRole } from '@/types/admin';
export type { StaffMember, StaffContext } from '@/types/staff';

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

export const STAFF_ROLES: StaffRole[] = ['owner', 'admin', 'manager', 'caster'];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  caster: 'Caster',
};

export const STAFF_ROLE_DESCRIPTION: Record<StaffRole, string> = {
  owner: 'Accès complet, gestion du staff, gestion des permissions',
  admin: 'Accès complet au back-office, gestion tournois & résultats',
  manager: 'Gestion opérationnelle : équipes, demandes, matches',
  caster: 'Accès lecture + meta info match (pour préparation cast)',
};

export const STAFF_ROLE_RANK: Record<StaffRole, number> = {
  owner: 3,
  admin: 2,
  manager: 1,
  caster: 0,
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

  const result = (data as StaffMember) ?? null;
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
      tokenUserCache.set(token, {
        user: null,
        expiresAt: now + TOKEN_CACHE_TTL,
      });
      return null;
    }
    tokenUserCache.set(token, { user, expiresAt: now + TOKEN_CACHE_TTL });
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
): Promise<StaffContext> {
  const ctx = await getStaffContextFromRequest(req, res);

  if (!ctx.user) {
    throw new StaffUnauthenticatedError();
  }

  if (!ctx.role || !hasAtLeastRole(ctx.role, minRole)) {
    throw new StaffUnauthorizedError('Accès non autorisé');
  }

  return ctx;
}

/* -----------------------------------------------------------
 * Helpers pratiques pour les API routes
 * ---------------------------------------------------------*/

/**
 * CSRF protection: for state-changing methods, verify the Origin or Referer
 * header matches the host to block cross-site form submissions.
 */
function csrfCheck(req: NextApiRequest): boolean {
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

export function withStaffRoute(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse,
    ctx: StaffContext
  ) => Promise<unknown>,
  minRole: StaffRole = 'admin'
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      if (!csrfCheck(req)) {
        res.status(403).json({ error: 'Forbidden: origin mismatch' });
        return;
      }
      const ctx = await requireStaffRoleFromRequest(req, res, minRole);
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
  return hasAtLeastRole(role, 'manager');
}

type StaffPageLoader<P> = (
  ctx: GetServerSidePropsContext,
  staffCtx: StaffContext
) => Promise<P> | P;

export function withStaffPage<
  P extends Record<string, unknown> = Record<string, unknown>,
>(
  minRole: StaffRole = 'admin',
  loader?: StaffPageLoader<P>
): GetServerSideProps {
  return async function (ctx: GetServerSidePropsContext) {
    const { req, res } = ctx;

    try {
      const staffCtx = await requireStaffRoleFromRequest(
        req as any,
        res as any,
        minRole
      );

      const baseProps = {
        staff: {
          id: staffCtx.staff?.id ?? null,
          role: staffCtx.role,
          display_name: staffCtx.staff?.display_name ?? null,
        },
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
