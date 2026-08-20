// utils/teams/memberships.ts
//
// « À quelle équipe cette personne appartient-elle ? » — une question qui avait
// UNE réponse, et qui peut désormais en avoir plusieurs.
//
// Jusqu'au 2026-08-20, la contrainte `team_members_tenant_user_key UNIQUE
// (tenant_id, user_id)` garantissait au plus une ligne par compte et par
// tenant. Une quinzaine de lectures s'appuyaient dessus, en `.maybeSingle()`
// sans `team_id` ni `.limit(1)`. Depuis que l'index est PARTIEL (il exclut le
// rôle `manager`, cf. database/migrations/allow_manager_multi_team.sql), ces
// lectures peuvent ramener plusieurs lignes pour un manager multi-équipes —
// et PostgREST répond alors PGRST116, c'est-à-dire une 500 sur un compte
// parfaitement légitime.
//
// Ce module remplace ces lectures par UNE lecture explicite + des sélecteurs
// PURS, pour que la règle soit écrite une fois et testable :
//
//   - `pickExclusiveMembership` : l'appartenance que l'index couvre encore
//     (tout sauf `manager`). Elle est unique PAR CONSTRUCTION — c'est la
//     « vraie » appartenance d'une joueuse, d'une sub ou d'une coach, et c'est
//     ce que doivent lire les gardes du type « tu es déjà dans une équipe ».
//   - `pickMembership` : l'appartenance de TRAVAIL d'un écran — celle demandée
//     (`?teamId=`), à défaut l'exclusive, à défaut la plus ancienne. C'est ce
//     que doivent lire les vues « mon équipe » (matchs, notifications…).
//
// Les deux distinguent des cas que « la première ligne trouvée » confondait.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Ligne d'appartenance, réduite à ce dont les appelants ont besoin. */
export type MembershipRow = {
  id: string;
  team_id: string;
  role: string | null;
};

/**
 * `true` si la ligne est couverte par l'index unique partiel — donc si elle
 * rend son compte « pris » pour le tenant. Miroir EXACT du prédicat SQL
 * `role IS DISTINCT FROM 'manager'` : un rôle NULL compte, seul `manager` est
 * exempté.
 */
export function isExclusiveMembership(
  row: { role?: string | null } | null | undefined
): boolean {
  if (!row) return false;
  return (row.role ?? '').trim().toLowerCase() !== 'manager';
}

/**
 * L'appartenance qui « prend » le compte, ou `null` si la personne n'encadre
 * que (rôles `manager` uniquement). Au plus une par tenant, garantie DB.
 */
export function pickExclusiveMembership<T extends { role?: string | null }>(
  rows: readonly T[]
): T | null {
  return rows.find((r) => isExclusiveMembership(r)) ?? null;
}

/**
 * L'appartenance sur laquelle un écran travaille.
 *
 * Ordre de préférence :
 *   1. `teamId` demandé, s'il correspond à une appartenance réelle — le choix
 *      du sélecteur d'équipe (cf. utils/teamScopeParam.ts) ;
 *   2. l'appartenance exclusive — pour une joueuse, sa seule équipe ;
 *   3. la première de la liste — repli déterministe pour un manager qui n'a
 *      encore rien choisi (les appelants passent une liste triée par
 *      ancienneté).
 */
export function pickMembership<
  T extends { team_id: string; role?: string | null },
>(rows: readonly T[], teamId?: string | null): T | null {
  if (teamId) {
    const requested = rows.find((r) => r.team_id === teamId);
    if (requested) return requested;
  }
  return pickExclusiveMembership(rows) ?? rows[0] ?? null;
}

/**
 * Toutes les appartenances d'un compte dans un tenant, de la plus ancienne à
 * la plus récente (ordre stable : c'est lui qui rend les replis
 * déterministes).
 *
 * `select` permet d'élargir les colonnes lues (embed PostgREST compris) sans
 * dupliquer la requête ; le tri et le scope tenant restent ici.
 */
export async function listMemberships<T = MembershipRow>(
  userId: string,
  tenantId: string,
  select = 'id, team_id, role'
): Promise<T[]> {
  if (!supabaseAdmin || !userId) return [];
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select(select)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('[memberships] lookup error', error);
    return [];
  }
  return (data || []) as T[];
}

/**
 * Raccourci `listMemberships` + `pickMembership` — le remplacement direct des
 * anciens `.maybeSingle()` sur (user_id, tenant_id).
 */
export async function resolveMembership(
  userId: string,
  tenantId: string,
  teamId?: string | null
): Promise<MembershipRow | null> {
  const rows = await listMemberships<MembershipRow>(userId, tenantId);
  return pickMembership(rows, teamId);
}

/**
 * Raccourci `listMemberships` + `pickExclusiveMembership` — pour les gardes
 * « cette personne appartient-elle déjà à une équipe ? », auxquelles un siège
 * de manager ne doit PAS répondre oui : la base, elle, la laisserait rejoindre
 * une équipe comme joueuse.
 */
export async function findExclusiveMembership(
  userId: string,
  tenantId: string
): Promise<MembershipRow | null> {
  const rows = await listMemberships<MembershipRow>(userId, tenantId);
  return pickExclusiveMembership(rows);
}
