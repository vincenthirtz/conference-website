// utils/teams/adminTeamsFilters.ts
//
// Filtres de la liste admin des équipes, partagés par `GET /api/admin/teams`
// (la liste paginée) et `GET /api/admin/teams/export` (l'extraction). Un export
// qui ne filtrerait pas EXACTEMENT comme l'écran qu'on vient de regarder
// livrerait un fichier qui ne correspond pas à ce que le staff a vu — et
// personne ne s'en rendrait compte avant d'avoir envoyé le fichier.

import { supabaseAdmin } from '@/utils/supabase';
import { escapePostgrestValue } from '@/utils/apiHelpers';

export type AdminTeamsFilters = {
  /** Déjà passé par `sanitizeSearch` (trim + longueur plafonnée). */
  search: string;
  isActive: boolean | undefined;
  /** Corbeille incluse (diagnostic ponctuel uniquement). */
  includeDeleted: boolean;
};

/** `?isActive=true|false` ; toute autre valeur = pas de filtre. */
export function parseActiveFilter(raw: unknown): boolean | undefined {
  return raw === 'true' ? true : raw === 'false' ? false : undefined;
}

type FilterableQuery = {
  is(column: string, value: null): unknown;
  eq(column: string, value: unknown): unknown;
  or(filters: string): unknown;
};

/**
 * Applique recherche / statut actif / exclusion de la corbeille à une requête
 * `teams` déjà scopée par tenant.
 *
 * Les équipes supprimées (soft-delete `deleted_at`) sortent par défaut : elles
 * vivent dans la corbeille (/admin/recycle-bin), seule vue à les lister.
 *
 * La recherche couvre name + slug + short_name (miroir du loader SSR de
 * pages/admin/teams/index.tsx), assainie par `escapePostgrestValue` pour que la
 * saisie ne puisse pas modifier la structure du filtre PostgREST `.or(...)`.
 */
//
// Générique SANS contrainte `Q extends FilterableQuery` : comparer
// structurellement un builder PostgREST typé (select à colonnes littérales) à
// cette interface fait exploser l'inférence (TS2589). Le builder renvoie
// toujours `this`, le cast interne est donc exact.
export function applyAdminTeamsFilters<Q>(
  query: Q,
  filters: AdminTeamsFilters
): Q {
  let q = query as unknown as FilterableQuery;
  if (!filters.includeDeleted) {
    q = q.is('deleted_at', null) as FilterableQuery;
  }
  if (typeof filters.isActive === 'boolean') {
    q = q.eq('is_active', filters.isActive) as FilterableQuery;
  }
  if (filters.search) {
    const s = `%${escapePostgrestValue(filters.search)}%`;
    q = q.or(
      `name.ilike.${s},slug.ilike.${s},short_name.ilike.${s}`
    ) as FilterableQuery;
  }
  return q as unknown as Q;
}

/**
 * Inscriptions d'un tournoi : `team_id -> tournament_teams.status`.
 *
 * Sert au filtre `?tournamentId=` (les clés) et au statut d'inscription de
 * l'export (les valeurs). Scopé tenant.
 */
export async function fetchTournamentRegistrations(
  tenantId: string,
  tournamentId: string
): Promise<{ registrations: Map<string, string | null>; error: unknown }> {
  const { data, error } = await supabaseAdmin
    .from('tournament_teams')
    .select('team_id, status')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);

  const registrations = new Map<string, string | null>();
  for (const row of (data ?? []) as Array<{
    team_id: string | null;
    status: string | null;
  }>) {
    if (row?.team_id) registrations.set(row.team_id, row.status ?? null);
  }
  return { registrations, error };
}
