// lib/staff.ts
/* Outils Staff : rôles, permissions, helpers SSR/API */
// @ts-nocheck
import type {
  NextApiRequest,
  NextApiResponse,
  GetServerSideProps,
  GetServerSidePropsContext,
} from 'next';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin, getServerClient } from './supabase';

/* -----------------------------------------------------------
 * Types & constantes
 * ---------------------------------------------------------*/

export type StaffRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'caster';

export type StaffMember = {
  id: string;
  auth_user_id: string;
  email: string;
  role: StaffRole;
  display_name: string | null;
  avatar_url: string | null; // optionnel en DB, pas grave si la colonne n'existe pas
  created_at: string;
};

export type StaffContext = {
  user: User | null;
  staff: StaffMember | null;
  role: StaffRole | null;
};

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

const ROLE_RANK: Record<StaffRole, number> = {
  owner: 3,
  admin: 2,
  manager: 1,
  caster: 0,
};

/* -----------------------------------------------------------
 * Helpers de base sur les rôles
 * ---------------------------------------------------------*/

export function formatStaffRoleLabel(role: StaffRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'manager':
      return 'Manager';
    case 'caster':
      return 'Caster';
    default:
      return role;
  }
}

export function hasAtLeastRole(
  role: StaffRole | null | undefined,
  minRole: StaffRole
): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
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
    throw new StaffUnauthorizedError(
      `Rôle ${minRole} requis (actuel : ${ctx.role ?? 'aucun'})`
    );
  }

  return ctx;
}

/* -----------------------------------------------------------
 * Staff logs
 * ---------------------------------------------------------*/

export type StaffLogAction =
  | 'login'
  | 'logout'
  | 'view_admin_page'
  | 'update_tournament'
  | 'create_tournament'
  | 'delete_tournament'
  | 'update_match'
  | 'create_match'
  | 'delete_match'
  | 'update_bracket'
  | 'update_team'
  | 'staff_batch_action'
  | 'other';

export type StaffLogPayload = Record<string, any>;

export async function logStaffAction(params: {
  staff_id: string;
  action: StaffLogAction;
  entity_type?: string | null;
  entity_id?: string | null;
  tournament_id?: string | null;
  payload?: StaffLogPayload | null;
}) {
  const {
    staff_id,
    action,
    entity_type = null,
    entity_id = null,
    tournament_id = null,
    payload = null,
  } = params;

  const { error } = await supabaseAdmin.from('staff_logs').insert({
    staff_id,
    action,
    entity_type,
    entity_id,
    tournament_id,
    payload,
  });

  if (error) {
    console.error('logStaffAction error:', error, params);
  }
}

/* -----------------------------------------------------------
 * Helpers pratiques pour les API routes
 * ---------------------------------------------------------*/

export function withStaffRoute(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse,
    ctx: StaffContext
  ) => Promise<void>,
  minRole: StaffRole = 'admin'
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const ctx = await requireStaffRoleFromRequest(req, res, minRole);
      await handler(req, res, ctx);
    } catch (err: any) {
      console.error('withStaffRoute error:', err);

      if (
        err instanceof StaffUnauthenticatedError ||
        err instanceof StaffUnauthorizedError
      ) {
        res.status(err.statusCode || 401).json({ error: err.message });
        return;
      }

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
    } catch (err: any) {
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
