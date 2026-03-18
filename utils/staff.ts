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

export const STAFF_ROLES: StaffRole[] = [
  'owner',
  'admin',
  'manager',
  'caster',
];

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
 * Récupérer le staff d'un user
 * ---------------------------------------------------------*/

export async function getStaffByUserId(
  userId: string
): Promise<StaffMember | null> {
  // 🔁 Utilise bien la table "staff" + colonne "auth_user_id"
  const { data, error } = await supabaseAdmin
    .from('staff')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('getStaffByUserId error:', error);
    return null;
  }

  return (data as StaffMember) ?? null;
}

export async function getStaffRole(userId: string): Promise<StaffRole | null> {
  const staff = await getStaffByUserId(userId);
  return staff?.role ?? null;
}

/* -----------------------------------------------------------
 * Contexte staff côté serveur (SSR / API routes)
 * ---------------------------------------------------------*/

/**
 * - API routes : on lit le header Authorization: Bearer <token>
 * - Pages SSR : on tombe en fallback sur getServerClient (cookies Supabase si tu les ajoutes un jour)
 */
export async function getStaffContextFromRequest(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<StaffContext> {
  let user: User | null = null;

  // 1) Essayer d'abord avec le token Bearer (cas API / fetch côté client)
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

  if (token) {
    const {
      data: { user: tokenUser },
      error: tokenError,
    } = await supabaseAdmin.auth.getUser(token);

    if (tokenError) {
      console.error('getStaffContextFromRequest token error:', tokenError);
    } else {
      user = tokenUser;
    }
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
        console.error('getStaffContextFromRequest cookie error:', cookieError);
      }
    }

    user = cookieUser ?? null;
  }

  // 3) Pas d'utilisateur → pas de contexte staff
  if (!user) {
    return {
      user: null,
      staff: null,
      role: null,
    };
  }

  // 4) Récupérer le staff correspondant
  const staff = await getStaffByUserId(user.id);

  return {
    user,
    staff,
    role: staff?.role ?? null,
  };
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
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

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
        res.status(err.statusCode || 401).json({ error: (err as Error).message });
        return;
      }

      // Log only unexpected errors
      console.error('withStaffRoute error:', err);
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

export function withStaffPage(
  minRole: StaffRole = 'admin'
): GetServerSideProps {
  return async function (ctx: GetServerSidePropsContext) {
    const { req, res } = ctx;

    try {
      const staffCtx = await requireStaffRoleFromRequest(
        req as any,
        res as any,
        minRole
      );

      return {
        props: {
          staff: {
            id: staffCtx.staff?.id ?? null,
            role: staffCtx.role,
            display_name: staffCtx.staff?.display_name ?? null,
          },
        },
      };
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
      console.error('withStaffPage error:', err);
      return {
        redirect: {
          destination: '/500',
          permanent: false,
        },
      };
    }
  };
}
