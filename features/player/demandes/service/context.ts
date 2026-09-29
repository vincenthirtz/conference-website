// features/player/demandes/service/context.ts — ce que reçoit un service de
// demandes : la base, le tenant, le SUJET et l'appelant authentifié (dont
// l'e-mail et les métadonnées alimentent le payload de la demande).

import type { User } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';

export type DemandesCtx = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
  /** Sujet de la requête (l'appelante hors inspection). */
  userId: string;
  /** Session réelle. */
  user: User;
};

/** Nom affiché de l'utilisateur, tel que les demandes le figent. */
export function displayNameOf(user: {
  user_metadata?: Record<string, unknown> | null;
}): string | null {
  const meta = user.user_metadata ?? {};
  return (
    (meta.display_name as string | undefined) ||
    (meta.full_name as string | undefined) ||
    null
  );
}

/** Rôle souhaité : toute valeur inconnue retombe sur `player`. */
export function normalizeDesiredRole(
  raw: string | null | undefined
): 'player' | 'substitute' | 'coach' {
  const role = raw?.trim().toLowerCase();
  return role === 'substitute'
    ? 'substitute'
    : role === 'coach'
      ? 'coach'
      : 'player';
}

/** Message libre : déjà trimé/plafonné par le schéma, `null` si vide. */
export function messageOf(raw: string | null | undefined): string | null {
  return (raw || null)?.slice(0, 1000) || null;
}
