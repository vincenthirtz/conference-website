// features/admin/demandes/listLoader.ts — chargement SSR de la liste staff des
// demandes (/admin/demandes). Sorti de pages/admin/demandes/index.tsx (règle
// A7 : la page est gelée en taille) quand l'assignation y est arrivée.
//
// Filtres de l'URL : type, statut (défaut `pending`), tournoi, recherche,
// période, tri, page — et `assigned` (`me` / `unassigned`). Les compteurs par
// statut appliquent tous les filtres SAUF le statut.
//
// Assignation (`assigned_staff_id`, `assigned_at`) : sans la migration
// add_staff_assignment_to_demandes_and_support_tickets, la liste se relit
// sans ces colonnes ni le filtre, et `assignmentAvailable` vaut false.
//
// La base est REÇUE (client service role fourni par la page), jamais importée
// ici : règle 3 de tests/unit/adminBoundariesGuard.test.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedUrlQuery } from 'querystring';
import { logger } from '@/utils/logger';
import type { DemandeStatus } from '@/components/admin/demandes/demandeChips';
import {
  ASSIGNMENT_COLUMNS,
  loadStaffBriefs,
  parseAssignmentFilter,
  withAssignmentFallback,
} from '../_shared/staffAssignment';
import {
  type Demande,
  sanitizeSearchInput,
  type StatusCounts,
  type TournamentMini,
  type UserMini,
} from './listModel';

export const DEMANDES_PAGE_SIZE = 50;

export const EMPTY_STATUS_COUNTS: StatusCounts = {
  pending: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
  total: 0,
};

export type DemandesListProps = {
  initialDemandes: Demande[];
  initialTotal: number | null;
  tournaments: TournamentMini[];
  statusCounts: StatusCounts;
  initialError: string | null;
  assignmentAvailable: boolean;
};

const BASE_COLUMNS = `
    id, user_id, team_id, tournament_id, type, status,
    comment, staff_note, source, payload,
    processed_at, processed_by_staff_id,
    created_at, updated_at,
    team:teams!demandes_team_id_fkey(id, name, short_name, logo_url),
    tournament:tournaments!demandes_tournament_id_fkey(id, name, slug)
  `;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function loadDemandesList(
  query: ParsedUrlQuery,
  scope: {
    tenantId: string;
    staffId: string;
    /** Client service role ; `null` = Supabase non configuré. */
    db: SupabaseClient<any> | null;
  }
): Promise<DemandesListProps> {
  const type = str(query.type);
  const statusRaw = typeof query.status === 'string' ? query.status : 'pending';
  const tournamentId = str(query.tournamentId);
  const search = sanitizeSearchInput(str(query.search));
  const from = str(query.from);
  const to = str(query.to);
  const offset = Math.max(0, Number(query.offset) || 0);
  const orderBy =
    query.orderBy === 'processed_at' ? 'processed_at' : 'created_at';
  const orderDir = query.orderDir === 'asc' ? 'asc' : 'desc';
  const assigned = parseAssignmentFilter(query.assigned);

  if (!scope.db) {
    return {
      initialDemandes: [],
      initialTotal: null,
      tournaments: [],
      statusCounts: EMPTY_STATUS_COUNTS,
      initialError: 'Service indisponible',
      assignmentAvailable: false,
    };
  }
  // Colonnes d'assignation hors du schéma généré : client non typé, le
  // périmètre (tenant) reste explicite sur chaque requête.
  const { db, tenantId, staffId } = scope;

  // Filtres communs à la page et aux compteurs (statut à part).
  function filtered(q: any, withAssignment: boolean) {
    let out = q;
    if (type) out = out.eq('type', type);
    if (tournamentId) out = out.eq('tournament_id', tournamentId);
    if (from) out = out.gte('created_at', from);
    if (to) out = out.lte('created_at', to);
    if (search) {
      const s = `%${search}%`;
      out = out.or(
        `comment.ilike.${s},staff_note.ilike.${s},source.ilike.${s}`
      );
    }
    if (withAssignment && assigned === 'me') {
      out = out.eq('assigned_staff_id', staffId);
    } else if (withAssignment && assigned === 'unassigned') {
      out = out.is('assigned_staff_id', null);
    }
    return out;
  }

  function countFor(targetStatus: DemandeStatus, withAssignment: boolean) {
    return filtered(
      db
        .from('demandes')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', targetStatus),
      withAssignment
    );
  }

  // Lancée tout de suite, en parallèle de la liste.
  const tournamentsQuery = Promise.resolve(
    db
      .from('tournaments')
      .select('id, name, slug')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(200)
  );

  const listed = await withAssignmentFallback(async (withAssignment) => {
    let q = filtered(
      db
        .from('demandes')
        .select(
          withAssignment
            ? `${BASE_COLUMNS}, ${ASSIGNMENT_COLUMNS}`
            : BASE_COLUMNS,
          { count: 'exact' }
        )
        .eq('tenant_id', tenantId),
      withAssignment
    )
      .order(orderBy, { ascending: orderDir === 'asc' })
      .range(offset, offset + DEMANDES_PAGE_SIZE - 1);
    if (statusRaw) q = q.eq('status', statusRaw);
    const [page, pending, approved, rejected, cancelled] = await Promise.all([
      q,
      countFor('pending', withAssignment),
      countFor('approved', withAssignment),
      countFor('rejected', withAssignment),
      countFor('cancelled', withAssignment),
    ]);
    return {
      page,
      pending,
      approved,
      rejected,
      cancelled,
      error: page.error as unknown,
    };
  });
  const tournamentsRes = await tournamentsQuery;
  const tournaments = (tournamentsRes.data || []) as TournamentMini[];

  if (listed.error) {
    logger.error('admin demandes SSR error:', listed.error);
    return {
      initialDemandes: [],
      initialTotal: null,
      tournaments,
      statusCounts: EMPTY_STATUS_COUNTS,
      initialError: 'Erreur lors du chargement',
      assignmentAvailable: listed.assignmentAvailable,
    };
  }

  const rows = (listed.page.data || []) as unknown as Demande[];

  // Demandeur·euses via Supabase Auth (en parallèle).
  const userIds = [
    ...new Set(rows.map((d) => d.user_id).filter(Boolean)),
  ] as string[];
  const userMap = new Map<string, UserMini>();
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const { data } = await db.auth.admin.getUserById(uid);
        if (data?.user) {
          const meta = (data.user.user_metadata ?? {}) as Record<string, any>;
          userMap.set(uid, {
            id: uid,
            email: data.user.email ?? null,
            display_name:
              (meta.display_name as string) ||
              (meta.full_name as string) ||
              data.user.email ||
              null,
            avatar_url: (meta.avatar_url as string) || null,
            battle_tag: (meta.battle_tag as string) || null,
            discord: (meta.discord as string) || null,
          });
        }
      } catch {
        // ignore individual failures
      }
    })
  );

  // Staff traitant ET staff assigné : une seule requête.
  const staffMap = await loadStaffBriefs(db, [
    ...rows.map((d) => d.processed_by_staff_id),
    ...rows.map((d) => d.assigned_staff_id),
  ]);

  const initialDemandes: Demande[] = rows.map((d) => ({
    ...d,
    user: d.user_id ? (userMap.get(d.user_id) ?? null) : null,
    processed_by: d.processed_by_staff_id
      ? (staffMap.get(d.processed_by_staff_id) ?? null)
      : null,
    assigned_to: d.assigned_staff_id
      ? (staffMap.get(d.assigned_staff_id) ?? null)
      : null,
  }));

  const c = {
    pending: listed.pending.count ?? 0,
    approved: listed.approved.count ?? 0,
    rejected: listed.rejected.count ?? 0,
    cancelled: listed.cancelled.count ?? 0,
  };

  return {
    initialDemandes,
    initialTotal:
      typeof listed.page.count === 'number' ? listed.page.count : null,
    tournaments,
    statusCounts: {
      ...c,
      total: c.pending + c.approved + c.rejected + c.cancelled,
    },
    initialError: null,
    assignmentAvailable: listed.assignmentAvailable,
  };
}
