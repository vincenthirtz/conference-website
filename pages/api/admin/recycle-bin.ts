// pages/api/admin/recycle-bin.ts
// GET  : liste paginée des éléments soft-deleted (stages/teams/matches inactives,
//        annonces, partenaires, casteurs, adhérents, staff, scrims).
// PATCH : restaurer un élément soft-deleted.
//
// Query params (GET) :
//   - type?: DeletedItem['type']   → filtre sur un seul type (paginé en DB)
//   - limit?: number (default 50)
//   - offset?: number (default 0)
//
// Réponse GET : { items: DeletedItem[]; total: number }
//
// ─────────────────────────────────────────────────────────────────────────────
// STRATÉGIE DE PAGINATION
// ─────────────────────────────────────────────────────────────────────────────
// Les éléments proviennent de N tables sources hétérogènes. Deux cas :
//
//   1) UN type est demandé (?type=team) → on pagine directement la table
//      concernée avec `.range(offset, offset+limit-1)` et un count `exact`.
//      `total` = nombre exact de rows soft-deleted de ce type. Mémoire O(limit).
//
//   2) AUCUN type (tous types confondus) → on ne peut pas pousser le ORDER BY
//      cross-table dans Postgres. Pour éviter de charger N×100 rows :
//        a) on récupère en parallèle le COUNT (head:true, count:'exact') de
//           chaque table → `total` = somme des counts ;
//        b) on récupère pour chaque table une tranche BORNÉE `.range(0,
//           offset+limit-1)` : au plus (offset+limit) rows par table, soit
//           juste ce qu'il faut pour garantir un tri global correct jusqu'à la
//           page courante (la page p ne peut contenir que des rows présentes
//           dans le top (offset+limit) de chaque source) ;
//        c) on fusionne, on trie par deleted_at desc, puis on slice
//           [offset, offset+limit].
//      Mémoire bornée à O(nbTables × (offset+limit)) au lieu de O(nbTables×100).
//
// Note multi-tenant : `partners`, `adherents` et `staff` n'ont PAS de colonne
// tenant_id (tables globales niveau association / staff cross-tenant — cf.
// database/migrations/add_tenant_id_to_tier1_tables.sql ligne 34 et la liste
// des 32 tables scoped dans enforce_tenant_id_not_null_and_fk.sql). On ne leur
// applique donc PAS de filtre tenant. Toutes les autres tables sont scopées.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { parsePagination } from '@/utils/apiHelpers';

import { logger } from '../../../utils/logger';

type DeletedType =
  | 'stage'
  | 'team'
  | 'match'
  | 'partner'
  | 'cast_member'
  | 'adherent'
  | 'staff'
  | 'scrim';

type DeletedItem = {
  id: string;
  type: DeletedType;
  name: string;
  details: string | null;
  deleted_at: string | null;
  tournament_id: string | null;
};

type ApiResponse =
  | { items: DeletedItem[]; total: number }
  | { restored: boolean; type: string; id: string }
  | { error: string };

const ALL_TYPES: DeletedType[] = [
  'stage',
  'team',
  'match',
  'partner',
  'cast_member',
  'adherent',
  'staff',
  'scrim',
];

export default withStaffRoute(handler, { permission: 'manage_settings' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, ctx);
    case 'PATCH':
      return handleRestore(req, res, ctx);
    default:
      res.setHeader('Allow', 'GET, PATCH');
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Source descriptors
 * Chaque type expose deux capacités :
 *  - buildCountQuery() : head:true count (pour `total`)
 *  - fetchSlice(limit) : récupère au plus `limit` rows soft-deleted, déjà
 *    triées deleted_at desc, et les mappe en DeletedItem[].
 * ────────────────────────────────────────────────────────────────────────── */

type SourceDescriptor = {
  // true si la table porte une colonne tenant_id (filtrage multi-tenant requis).
  // partners / adherents / staff = global → false.
  tenantScoped: boolean;
  buildCountQuery: (ctx: AuthenticatedStaffContext) => any;
  fetchSlice: (
    ctx: AuthenticatedStaffContext,
    limit: number
  ) => Promise<DeletedItem[]>;
};

// Filtre commun "soft-deleted" : deleted_at NOT NULL.
function notDeleted(query: any) {
  return query.not('deleted_at', 'is', null);
}

const SOURCES: Record<DeletedType, SourceDescriptor> = {
  stage: {
    tenantScoped: true,
    buildCountQuery: (ctx) =>
      notDeleted(
        supabaseAdmin!
          .from('tournament_stages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', ctx.tenantId)
      ),
    fetchSlice: async (ctx, limit) => {
      const { data } = await notDeleted(
        supabaseAdmin!
          .from('tournament_stages')
          .select('id, name, stage_type, tournament_id, deleted_at')
          .eq('tenant_id', ctx.tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);

      return (data || []).map((s: any) => ({
        id: s.id,
        type: 'stage' as const,
        name: s.name || 'Phase sans nom',
        details: s.stage_type || null,
        deleted_at: s.deleted_at,
        tournament_id: s.tournament_id,
      }));
    },
  },

  team: {
    tenantScoped: true,
    buildCountQuery: (ctx) =>
      notDeleted(
        supabaseAdmin!
          .from('teams')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', ctx.tenantId)
      ),
    fetchSlice: async (ctx, limit) => {
      const { data } = await notDeleted(
        supabaseAdmin!
          .from('teams')
          .select('id, name, short_name, deleted_at')
          .eq('tenant_id', ctx.tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);

      return (data || []).map((t: any) => ({
        id: t.id,
        type: 'team' as const,
        name: t.name || 'Equipe sans nom',
        details: t.short_name || null,
        deleted_at: t.deleted_at,
        tournament_id: null,
      }));
    },
  },

  match: {
    tenantScoped: true,
    buildCountQuery: (ctx) =>
      notDeleted(
        supabaseAdmin!
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', ctx.tenantId)
      ),
    fetchSlice: async (ctx, limit) => {
      const { data: matches } = await notDeleted(
        supabaseAdmin!
          .from('matches')
          .select(
            'id, tournament_id, stage_id, round_number, team1_id, team2_id, deleted_at'
          )
          .eq('tenant_id', ctx.tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);

      const rows = matches || [];

      // Fetch team names for match labels (scopé tenant).
      const teamIds = new Set<string>();
      for (const m of rows) {
        if (m.team1_id) teamIds.add(m.team1_id);
        if (m.team2_id) teamIds.add(m.team2_id);
      }

      const teamNameMap = new Map<string, string>();
      if (teamIds.size > 0) {
        const { data: teamsData } = await supabaseAdmin!
          .from('teams')
          .select('id, name')
          .eq('tenant_id', ctx.tenantId)
          .in('id', Array.from(teamIds));

        for (const t of teamsData || []) {
          teamNameMap.set(t.id, t.name);
        }
      }

      return rows.map((m: any) => {
        const t1 = m.team1_id ? teamNameMap.get(m.team1_id) || 'TBD' : 'TBD';
        const t2 = m.team2_id ? teamNameMap.get(m.team2_id) || 'TBD' : 'TBD';
        return {
          id: m.id,
          type: 'match' as const,
          name: `${t1} vs ${t2}`,
          details: m.round_number ? `Round ${m.round_number}` : null,
          deleted_at: m.deleted_at,
          tournament_id: m.tournament_id,
        };
      });
    },
  },

  // partners : table GLOBALE (pas de tenant_id) → aucun filtre tenant.
  partner: {
    tenantScoped: false,
    buildCountQuery: () =>
      notDeleted(
        supabaseAdmin!
          .from('partners')
          .select('id', { count: 'exact', head: true })
      ),
    fetchSlice: async (_ctx, limit) => {
      const { data } = await notDeleted(
        supabaseAdmin!.from('partners').select('id, name, category, deleted_at')
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);

      return (data || []).map((p: any) => ({
        id: p.id,
        type: 'partner' as const,
        name: p.name || 'Partenaire sans nom',
        details: p.category || null,
        deleted_at: p.deleted_at,
        tournament_id: null,
      }));
    },
  },

  cast_member: {
    tenantScoped: true,
    buildCountQuery: (ctx) =>
      notDeleted(
        supabaseAdmin!
          .from('cast_members')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', ctx.tenantId)
      ),
    fetchSlice: async (ctx, limit) => {
      const { data } = await notDeleted(
        supabaseAdmin!
          .from('cast_members')
          .select('id, display_name, role, deleted_at')
          .eq('tenant_id', ctx.tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);

      return (data || []).map((c: any) => ({
        id: c.id,
        type: 'cast_member' as const,
        name: c.display_name || 'Membre sans nom',
        details: c.role || null,
        deleted_at: c.deleted_at,
        tournament_id: null,
      }));
    },
  },

  // adherents : table GLOBALE (pas de tenant_id) → aucun filtre tenant.
  adherent: {
    tenantScoped: false,
    buildCountQuery: () =>
      notDeleted(
        supabaseAdmin!
          .from('adherents')
          .select('id', { count: 'exact', head: true })
      ),
    fetchSlice: async (_ctx, limit) => {
      const { data } = await notDeleted(
        supabaseAdmin!
          .from('adherents')
          .select('id, first_name, last_name, email, deleted_at')
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);

      return (data || []).map((a: any) => {
        const fullName = [a.first_name, a.last_name].filter(Boolean).join(' ');
        return {
          id: a.id,
          type: 'adherent' as const,
          name: fullName || 'Adherent sans nom',
          details: a.email || null,
          deleted_at: a.deleted_at,
          tournament_id: null,
        };
      });
    },
  },

  // staff : table GLOBALE (staff cross-tenant) → aucun filtre tenant.
  // Soft-delete = is_active=false OU deleted_at NOT NULL.
  staff: {
    tenantScoped: false,
    buildCountQuery: () =>
      supabaseAdmin!
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .or('is_active.eq.false,deleted_at.not.is.null'),
    fetchSlice: async (_ctx, limit) => {
      const { data } = await supabaseAdmin!
        .from('staff')
        .select('id, display_name, email, role, deleted_at')
        .or('is_active.eq.false,deleted_at.not.is.null')
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);

      return (data || []).map((s: any) => ({
        id: s.id,
        type: 'staff' as const,
        name: s.display_name || s.email || 'Staff sans nom',
        details: s.role || null,
        deleted_at: s.deleted_at,
        tournament_id: null,
      }));
    },
  },

  scrim: {
    tenantScoped: true,
    buildCountQuery: (ctx) =>
      notDeleted(
        supabaseAdmin!
          .from('scrims')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', ctx.tenantId)
      ),
    fetchSlice: async (ctx, limit) => {
      const { data } = await notDeleted(
        supabaseAdmin!
          .from('scrims')
          .select('id, name, slug, status, deleted_at')
          .eq('tenant_id', ctx.tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);

      return (data || []).map((s: any) => ({
        id: s.id,
        type: 'scrim' as const,
        name: s.name,
        details: `${s.status} · ${s.slug}`,
        deleted_at: s.deleted_at,
        tournament_id: null,
      }));
    },
  },
};

function deletedAtTime(item: DeletedItem): number {
  return item.deleted_at ? new Date(item.deleted_at).getTime() : 0;
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const rawType = req.query.type;
  const typeFilter = (Array.isArray(rawType) ? rawType[0] : rawType) as
    | DeletedType
    | undefined;

  const { limit, offset } = parsePagination(req, { limit: 50 });

  // ── Cas 1 : un seul type demandé → pagination DB native + count exact ──────
  if (typeFilter) {
    if (!ALL_TYPES.includes(typeFilter)) {
      return res.status(400).json({ error: `Unknown type: ${typeFilter}` });
    }

    const src = SOURCES[typeFilter];
    try {
      // Count exact via head:true.
      const { count, error: countError } = await src.buildCountQuery(ctx);
      if (countError) throw countError;

      // Page demandée : on récupère (offset+limit) rows triées puis on slice.
      // PostgREST .range(offset, offset+limit-1) ne s'applique proprement que
      // si la query expose son order ; on délègue donc à un slice borné côté
      // descriptor pour rester cohérent avec le cas "tous types".
      const slice = await fetchSlicePaged(typeFilter, ctx, offset, limit);

      return res.status(200).json({
        items: slice,
        total: typeof count === 'number' ? count : slice.length,
      });
    } catch (err: unknown) {
      logger.error('[/api/admin/recycle-bin] GET single-type error:', err);
      return res.status(500).json({ error: 'Failed to fetch recycle bin' });
    }
  }

  // ── Cas 2 : tous types → counts en parallèle + slices bornées + merge ──────
  try {
    const boundedSlice = offset + limit; // au plus ce qu'il faut pour la page

    const countPromises = ALL_TYPES.map((t) =>
      SOURCES[t].buildCountQuery(ctx).then((r: any) => {
        if (r.error) throw r.error;
        return typeof r.count === 'number' ? r.count : 0;
      })
    );
    const slicePromises = ALL_TYPES.map((t) =>
      SOURCES[t].fetchSlice(ctx, boundedSlice)
    );

    const [counts, slices] = await Promise.all([
      Promise.all(countPromises),
      Promise.all(slicePromises),
    ]);

    const total = counts.reduce((acc, n) => acc + n, 0);

    // Merge + tri global deleted_at desc, puis slice à la page courante.
    const merged = slices.flat();
    merged.sort((a, b) => deletedAtTime(b) - deletedAtTime(a));
    const items = merged.slice(offset, offset + limit);

    return res.status(200).json({ items, total });
  } catch (err: unknown) {
    logger.error('[/api/admin/recycle-bin] GET all-types error:', err);
    return res.status(500).json({ error: 'Failed to fetch recycle bin' });
  }
}

// Récupère la page [offset, offset+limit) pour un type donné.
// On borne le fetch à (offset+limit) rows déjà triées puis on slice — même
// logique que le cas multi-type, mais sur une seule source.
async function fetchSlicePaged(
  type: DeletedType,
  ctx: AuthenticatedStaffContext,
  offset: number,
  limit: number
): Promise<DeletedItem[]> {
  const rows = await SOURCES[type].fetchSlice(ctx, offset + limit);
  return rows.slice(offset, offset + limit);
}

async function handleRestore(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { id, type } = req.body || {};

  if (!id || !type) {
    return res.status(400).json({ error: 'id and type are required' });
  }

  const nowIso = new Date().toISOString();

  try {
    switch (type) {
      case 'stage': {
        const { error } = await supabaseAdmin!
          .from('tournament_stages')
          .update({
            is_active: true,
            is_public: true,
            deleted_at: null,
            updated_at: nowIso,
          })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;
        break;
      }
      case 'team': {
        const { error } = await supabaseAdmin!
          .from('teams')
          .update({ is_active: true, deleted_at: null, updated_at: nowIso })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;
        break;
      }
      case 'match': {
        const { error } = await supabaseAdmin!
          .from('matches')
          .update({ status: 'pending', deleted_at: null, updated_at: nowIso })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;
        break;
      }
      case 'partner': {
        // Table GLOBALE (pas de tenant_id) → pas de filtre tenant.
        const { error } = await supabaseAdmin!
          .from('partners')
          .update({ is_active: true, deleted_at: null, updated_at: nowIso })
          .eq('id', id);

        if (error) throw error;
        break;
      }
      case 'cast_member': {
        const { error } = await supabaseAdmin!
          .from('cast_members')
          .update({ is_active: true, deleted_at: null, updated_at: nowIso })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;
        break;
      }
      case 'adherent': {
        // Table GLOBALE (pas de tenant_id) → pas de filtre tenant.
        const { error } = await supabaseAdmin!
          .from('adherents')
          .update({ is_active: true, deleted_at: null, updated_at: nowIso })
          .eq('id', id);

        if (error) throw error;
        break;
      }
      case 'staff': {
        // Restore d'un staff soft-delete : réactive is_active + clear
        // deleted_at. Le rôle d'origine est conservé (la row reste). Le
        // user_metadata.role côté auth doit être resync côté UI si nécessaire
        // (out of scope du restore brut). Table GLOBALE → pas de filtre tenant.
        const { error } = await supabaseAdmin!
          .from('staff')
          .update({ is_active: true, deleted_at: null })
          .eq('id', id);

        if (error) throw error;
        break;
      }
      case 'scrim': {
        const { error } = await supabaseAdmin!
          .from('scrims')
          .update({ deleted_at: null, updated_at: nowIso })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId);
        if (error) throw error;
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown type: ${type}` });
    }

    // Log staff action
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'other',
          entity_type: type,
          entity_id: id,
          payload: { action_label: 'restore_item', type, restored_at: nowIso },
        });
      } catch (e) {
        logger.error('recycle-bin logStaffAction error:', e);
      }
    }

    return res.status(200).json({ restored: true, type, id });
  } catch (err: unknown) {
    logger.error('[/api/admin/recycle-bin] restore error:', err);
    return res
      .status(500)
      .json({ error: (err as Error)?.message || 'Failed to restore item' });
  }
}
