// utils/casterAuth.ts
//
// Middleware d'authentification pour les routes /api/caster/* (PWA Caster
// Cockpit, feature Run-of-show Lot 2).
//
// Pattern : on s'appuie sur `withStaffRoute(handler, 'caster')` (qui resoud
// deja la session utilisateur + le tenantId actif via cookie / fallback) et on
// AJOUTE une verification supplementaire : l'utilisateur doit etre lie a une
// fiche `cast_members` active dans le tenant courant
// (`cast_members.auth_user_id = ctx.user.id AND is_active = true`).
//
// Pourquoi cette double couche :
//   - Le role staff 'caster' est attribue par les admins (table staff). C'est
//     l'authentification.
//   - La fiche `cast_members` (page publique) porte le profil cast — image,
//     twitch_url, city, etc. C'est l'identite produit "casteur".
//   - Sans fiche `cast_members` active, le caster n'est pas reellement
//     operationnel : pas de profil, pas de visuel sur le site, et le briefing
//     T-30 ne saurait pas a qui DM. On bloque donc l'acces au cockpit.
//
// Limitations connues (V1) :
//   - cast_members.auth_user_id est populé manuellement par les admins via
//     /admin/cast-members. Tant qu'il n'est pas rempli, le caster ne peut
//     pas se connecter au cockpit. La creation de session caster
//     (magic-link) est prevue au Lot 4 — d'ici la, les admins doivent
//     populer la colonne a la main.
//   - On reste sur le tenant resolu par withStaffRoute (cookie / fallback).
//     On force aussi le cast_members.tenant_id a matcher, pour eviter qu'un
//     caster du tenant X bascule sur le tenant Y via cookie tampere.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from './supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from './staff';
import { logger } from './logger';

export type CasterMember = {
  id: string;
  name: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  twitch_url: string | null;
  city: string | null;
  is_active: boolean;
  tenant_id: string;
  auth_user_id: string;
};

export type AuthenticatedCasterContext = {
  caster: CasterMember;
  tenantId: string;
  staff: AuthenticatedStaffContext['staff'];
  user: AuthenticatedStaffContext['user'];
};

export type CasterRouteHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedCasterContext
) => Promise<unknown> | unknown;

/**
 * Resolve the `cast_members` row linked to the authenticated user inside
 * their active tenant. Returns null if no active link.
 */
export async function getCasterForStaffContext(
  ctx: AuthenticatedStaffContext
): Promise<CasterMember | null> {
  if (!supabaseAdmin) return null;
  if (!ctx.user?.id) return null;

  const { data, error } = await supabaseAdmin
    .from('cast_members')
    .select(
      'id, name, title, description, image_url, twitch_url, city, is_active, tenant_id, auth_user_id'
    )
    .eq('auth_user_id', ctx.user.id)
    .eq('tenant_id', ctx.tenantId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    logger.error('[casterAuth] cast_members lookup error', error);
    return null;
  }

  return (data as CasterMember | null) ?? null;
}

/**
 * Wrap a Next.js API handler with caster auth.
 *
 * Flow :
 *   1. `withStaffRoute(_, 'caster')` valide la session + role >= caster + CSRF
 *      et resoud `ctx.tenantId`.
 *   2. On lookup `cast_members` lie a l'user dans ce tenant.
 *   3. Si aucune fiche active → 403 avec code `CASTER_NOT_LINKED`.
 *   4. Sinon on appelle le handler avec un contexte enrichi.
 */
export function withCasterRoute(handler: CasterRouteHandler) {
  return withStaffRoute(async (req, res, staffCtx) => {
    const caster = await getCasterForStaffContext(staffCtx);
    if (!caster) {
      return res.status(403).json({
        error:
          'Aucune fiche caster active liee a ce compte. Contacte un admin.',
        code: 'CASTER_NOT_LINKED',
      });
    }
    const ctx: AuthenticatedCasterContext = {
      caster,
      tenantId: caster.tenant_id,
      staff: staffCtx.staff,
      user: staffCtx.user,
    };
    return handler(req, res, ctx);
  }, 'caster');
}
