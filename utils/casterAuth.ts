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
import {
  withStaffRoute,
  hasAtLeastRole,
  type AuthenticatedStaffContext,
} from './staff';
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
  is_internal: boolean;
};

// Colonnes du SELECT — partagées entre le lookup et l'auto-provision pour que
// la ligne auto-provisionnée ait exactement la même forme que le lookup.
const CASTER_SELECT_COLUMNS =
  'id, name, title, description, image_url, twitch_url, city, is_active, tenant_id, auth_user_id, is_internal';

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
 *
 * Auto-provision : si aucune fiche active n'est liée à l'utilisateur ET que
 * celui-ci est admin/owner (`hasAtLeastRole(ctx.role, 'admin')`), on
 * auto-provisionne (ou réactive) une fiche INTERNE (`is_internal = true`) afin
 * que l'admin/owner puisse piloter le cockpit Régie sans qu'un admin ait à lui
 * créer une fiche publique à la main. Les écritures du cockpit
 * (caster_presence, event_cue_acks) ont une FK dure vers cast_members(id), il
 * faut donc une vraie ligne — d'où l'INSERT plutôt qu'un objet éphémère.
 *
 * Un caster (rôle strict, sans droits admin) sans fiche liée garde le
 * comportement historique : null → 403 CASTER_NOT_LINKED.
 */
export async function getCasterForStaffContext(
  ctx: AuthenticatedStaffContext
): Promise<CasterMember | null> {
  if (!supabaseAdmin) return null;
  if (!ctx.user?.id) return null;

  const { data, error } = await supabaseAdmin
    .from('cast_members')
    .select(CASTER_SELECT_COLUMNS)
    .eq('auth_user_id', ctx.user.id)
    .eq('tenant_id', ctx.tenantId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    logger.error('[casterAuth] cast_members lookup error', error);
    return null;
  }

  if (data) return data as CasterMember;

  // Pas de fiche active : auto-provision réservée aux admin/owner.
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return null;
  }

  return provisionInternalCaster(ctx);
}

/**
 * Auto-provisionne (idempotent) une fiche `cast_members` interne pour un
 * admin/owner qui n'a pas encore de fiche active dans le tenant courant.
 *
 * Idempotence / concurrence :
 *   1. On re-SELECT d'abord TOUTE fiche existante (active ou non, interne ou
 *      non) pour cet `auth_user_id` + `tenant_id`, en préférant la fiche
 *      interne puis la plus récente. Cela évite les doublons quand une fiche
 *      inactive (ex. auto-provision passée puis désactivée) traîne déjà.
 *      Si trouvée : on la réactive au besoin et on la réutilise.
 *   2. Sinon on INSERT une fiche interne fraîche.
 *   3. En cas de course (deux requêtes simultanées) : sur violation d'unicité
 *      (23505), on re-SELECT la fiche créée par l'autre requête. C'est aussi le
 *      filet si une contrainte unique (auth_user_id, tenant_id) existe.
 */
async function provisionInternalCaster(
  ctx: AuthenticatedStaffContext
): Promise<CasterMember | null> {
  if (!supabaseAdmin) return null;
  const authUserId = ctx.user.id;
  const tenantId = ctx.tenantId;

  // 1) Re-select best-effort : réutiliser une fiche existante pour ne pas créer
  //    de doublon. On préfère une fiche interne, puis la plus récente.
  const { data: existingRows, error: existingErr } = await supabaseAdmin
    .from('cast_members')
    .select(CASTER_SELECT_COLUMNS)
    .eq('auth_user_id', authUserId)
    .eq('tenant_id', tenantId)
    .order('is_internal', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingErr) {
    logger.error('[casterAuth] internal caster re-select error', existingErr);
    return null;
  }

  const existing = (existingRows?.[0] as CasterMember | undefined) ?? null;
  if (existing) {
    if (existing.is_active) return existing;

    // Fiche présente mais inactive → réactiver et réutiliser.
    const { data: reactivated, error: reErr } = await supabaseAdmin
      .from('cast_members')
      .update({ is_active: true })
      .eq('id', existing.id)
      .select(CASTER_SELECT_COLUMNS)
      .single();
    if (reErr) {
      logger.error('[casterAuth] internal caster reactivate error', reErr);
      return null;
    }
    return reactivated as CasterMember;
  }

  // 2) Aucune fiche existante → INSERT d'une fiche interne.
  const insertPayload = {
    tenant_id: tenantId,
    auth_user_id: authUserId,
    name: ctx.staff.display_name || 'Régie',
    title: 'Régie',
    is_active: true,
    is_internal: true,
  };

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('cast_members')
    .insert(insertPayload)
    .select(CASTER_SELECT_COLUMNS)
    .single();

  if (!insertErr) return inserted as CasterMember;

  // 3) Concurrence : une autre requête a inséré la fiche entre notre SELECT et
  //    notre INSERT (violation d'unicité). On re-SELECT et on réutilise.
  if (insertErr.code === '23505') {
    const { data: retryRows } = await supabaseAdmin
      .from('cast_members')
      .select(CASTER_SELECT_COLUMNS)
      .eq('auth_user_id', authUserId)
      .eq('tenant_id', tenantId)
      .order('is_active', { ascending: false })
      .limit(1);
    const row = (retryRows?.[0] as CasterMember | undefined) ?? null;
    if (row) return row;
  }

  logger.error('[casterAuth] internal caster insert error', insertErr);
  return null;
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
