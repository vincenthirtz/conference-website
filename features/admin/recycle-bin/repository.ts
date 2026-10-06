// features/admin/recycle-bin/repository.ts — lectures / restaurations des
// éléments soft-deleted, une source par type.
//
// `partners`, `adherents` et `staff` n'ont PAS de tenant_id (tables globales,
// cf. add_tenant_id_to_tier1_tables.sql) : aucun filtre tenant sur elles.
// Toutes les autres sources sont scopées.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import { ANONYMIZED_ADHERENT_EMAIL_SUFFIX, type DeletedType } from './schemas';
import { isMissingColumnError } from './missingColumn';

export type DeletedItem = {
  id: string;
  type: DeletedType;
  name: string;
  details: string | null;
  deleted_at: string | null;
  tournament_id: string | null;
};

/** Ce que rend un `select(..., { count: 'exact', head: true })`. */
type CountResult = { count: number | null; error: unknown };

type SourceDescriptor = {
  buildCountQuery: (
    db: SupabaseClient,
    tenantId: string
  ) => PromiseLike<CountResult>;
  fetchSlice: (
    db: SupabaseClient,
    tenantId: string,
    limit: number
  ) => Promise<DeletedItem[]>;
};

/** Client non typé : sources choisies par un manifeste (`SOURCES`). */
function untyped(db: AdminDb): SupabaseClient {
  return db as unknown as SupabaseClient;
}

// Recopies des `.select()` ; la nullabilité suit la base (information_schema).
type DeletedStageRow = {
  id: string;
  name: string;
  stage_type: string;
  tournament_id: string | null;
  deleted_at: string;
};
type DeletedTeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  deleted_at: string;
};
type DeletedMatchRow = {
  id: string;
  team1_id: string | null;
  team2_id: string | null;
  round_number: number | null;
  tournament_id: string | null;
  deleted_at: string;
};
type DeletedPartnerRow = {
  id: string;
  name: string;
  category: string;
  deleted_at: string;
};
type DeletedCastMemberRow = {
  id: string;
  name: string;
  title: string | null;
  deleted_at: string;
};
type DeletedAdherentRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  deleted_at: string;
};
type DeletedStaffRow = {
  id: string;
  display_name: string | null;
  email: string;
  role: string;
  deleted_at: string;
};
type DeletedScrimRow = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  deleted_at: string;
};

type DeletedScrimPlanningRow = {
  id: string;
  title: string | null;
  status: string;
  deleted_at: string;
};
type DeletedTaskRow = {
  id: string;
  title: string;
  priority: string;
  deleted_at: string;
};
type DeletedNewsRow = {
  id: string;
  title: string;
  slug: string;
  deleted_at: string;
};

/** Adhérents anonymisés par la purge : hors corbeille (cf. schemas). */
const NOT_ANONYMIZED = `%${ANONYMIZED_ADHERENT_EMAIL_SUFFIX}`;

/**
 * `news.deleted_at` dépend de add_news_soft_delete.sql : tant qu'elle n'est
 * pas appliquée, la source « actualités » est vide plutôt que de faire tomber
 * toute la corbeille.
 */
function newsColumnMissing(error: unknown): boolean {
  return isMissingColumnError(error, 'deleted_at');
}

/** Filtre commun « soft-deleted » : deleted_at NOT NULL (générique, pas `any`). */
function notDeleted<T extends { not: (c: string, op: string, v: null) => T }>(
  query: T
): T {
  return query.not('deleted_at', 'is', null);
}

const head = { count: 'exact', head: true } as const;

const SOURCES: Record<DeletedType, SourceDescriptor> = {
  stage: {
    buildCountQuery: (db, tenantId) =>
      notDeleted(
        db
          .from('tournament_stages')
          .select('id', head)
          .eq('tenant_id', tenantId)
      ),
    fetchSlice: async (db, tenantId, limit) => {
      const { data } = await notDeleted(
        db
          .from('tournament_stages')
          .select('id, name, stage_type, tournament_id, deleted_at')
          .eq('tenant_id', tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      return ((data || []) as DeletedStageRow[]).map((s) => ({
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
    buildCountQuery: (db, tenantId) =>
      notDeleted(db.from('teams').select('id', head).eq('tenant_id', tenantId)),
    fetchSlice: async (db, tenantId, limit) => {
      const { data } = await notDeleted(
        db
          .from('teams')
          .select('id, name, short_name, deleted_at')
          .eq('tenant_id', tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      return ((data || []) as DeletedTeamRow[]).map((t) => ({
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
    buildCountQuery: (db, tenantId) =>
      notDeleted(
        db.from('matches').select('id', head).eq('tenant_id', tenantId)
      ),
    fetchSlice: async (db, tenantId, limit) => {
      const { data: matches } = await notDeleted(
        db
          .from('matches')
          .select(
            'id, tournament_id, stage_id, round_number, team1_id, team2_id, deleted_at'
          )
          .eq('tenant_id', tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      const rows = (matches || []) as DeletedMatchRow[];

      // Noms d'équipes pour le libellé (scopé tenant).
      const teamIds = new Set<string>();
      for (const m of rows) {
        if (m.team1_id) teamIds.add(m.team1_id);
        if (m.team2_id) teamIds.add(m.team2_id);
      }
      const teamNameMap = new Map<string, string>();
      if (teamIds.size > 0) {
        const { data: teamsData } = await db
          .from('teams')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .in('id', Array.from(teamIds));
        for (const t of (teamsData || []) as Array<{
          id: string;
          name: string;
        }>) {
          teamNameMap.set(t.id, t.name);
        }
      }

      return rows.map((m) => {
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

  // Table GLOBALE → aucun filtre tenant.
  partner: {
    buildCountQuery: (db) => notDeleted(db.from('partners').select('id', head)),
    fetchSlice: async (db, _tenantId, limit) => {
      const { data } = await notDeleted(
        db.from('partners').select('id, name, category, deleted_at')
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      return ((data || []) as DeletedPartnerRow[]).map((p) => ({
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
    buildCountQuery: (db, tenantId) =>
      notDeleted(
        db.from('cast_members').select('id', head).eq('tenant_id', tenantId)
      ),
    fetchSlice: async (db, tenantId, limit) => {
      const { data } = await notDeleted(
        db
          .from('cast_members')
          // `name` et `title` — ni `display_name` ni `role`.
          .select('id, name, title, deleted_at')
          .eq('tenant_id', tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      return ((data || []) as DeletedCastMemberRow[]).map((c) => ({
        id: c.id,
        type: 'cast_member' as const,
        name: c.name || 'Membre sans nom',
        details: c.title || null,
        deleted_at: c.deleted_at,
        tournament_id: null,
      }));
    },
  },

  // Table GLOBALE → aucun filtre tenant.
  adherent: {
    buildCountQuery: (db) =>
      notDeleted(db.from('adherents').select('id', head)).not(
        'email',
        'like',
        NOT_ANONYMIZED
      ),
    fetchSlice: async (db, _tenantId, limit) => {
      const { data } = await notDeleted(
        db
          .from('adherents')
          .select('id, first_name, last_name, email, deleted_at')
      )
        .not('email', 'like', NOT_ANONYMIZED)
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      return ((data || []) as DeletedAdherentRow[]).map((a) => {
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

  // Table GLOBALE (staff cross-tenant). Soft-delete = is_active=false OU
  // deleted_at NOT NULL.
  staff: {
    buildCountQuery: (db) =>
      db
        .from('staff')
        .select('id', head)
        .or('is_active.eq.false,deleted_at.not.is.null'),
    fetchSlice: async (db, _tenantId, limit) => {
      const { data } = await db
        .from('staff')
        .select('id, display_name, email, role, deleted_at')
        .or('is_active.eq.false,deleted_at.not.is.null')
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      return ((data || []) as DeletedStaffRow[]).map((s) => ({
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
    buildCountQuery: (db, tenantId) =>
      notDeleted(
        db.from('scrims').select('id', head).eq('tenant_id', tenantId)
      ),
    fetchSlice: async (db, tenantId, limit) => {
      const { data } = await notDeleted(
        db
          .from('scrims')
          .select('id, name, slug, status, deleted_at')
          .eq('tenant_id', tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      return ((data || []) as DeletedScrimRow[]).map((s) => ({
        id: s.id,
        type: 'scrim' as const,
        name: s.name,
        // `slug` nullable : sans repli, l'écran affichait « null ».
        details: s.slug ? `${s.status} · ${s.slug}` : s.status,
        deleted_at: s.deleted_at,
        tournament_id: null,
      }));
    },
  },

  scrim_planning: {
    buildCountQuery: (db, tenantId) =>
      notDeleted(
        db.from('scrim_plannings').select('id', head).eq('tenant_id', tenantId)
      ),
    fetchSlice: async (db, tenantId, limit) => {
      const { data } = await notDeleted(
        db
          .from('scrim_plannings')
          .select('id, title, status, deleted_at')
          .eq('tenant_id', tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      return ((data || []) as DeletedScrimPlanningRow[]).map((p) => ({
        id: p.id,
        type: 'scrim_planning' as const,
        name: p.title || 'Planning sans titre',
        details: p.status || null,
        deleted_at: p.deleted_at,
        tournament_id: null,
      }));
    },
  },

  task: {
    buildCountQuery: (db, tenantId) =>
      notDeleted(db.from('tasks').select('id', head).eq('tenant_id', tenantId)),
    fetchSlice: async (db, tenantId, limit) => {
      const { data } = await notDeleted(
        db
          .from('tasks')
          .select('id, title, priority, deleted_at')
          .eq('tenant_id', tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      return ((data || []) as DeletedTaskRow[]).map((t) => ({
        id: t.id,
        type: 'task' as const,
        name: t.title || 'Tâche sans titre',
        details: t.priority || null,
        deleted_at: t.deleted_at,
        tournament_id: null,
      }));
    },
  },

  news: {
    buildCountQuery: async (db, tenantId) => {
      const r = await notDeleted(
        db.from('news').select('id', head).eq('tenant_id', tenantId)
      );
      return newsColumnMissing(r.error) ? { count: 0, error: null } : r;
    },
    fetchSlice: async (db, tenantId, limit) => {
      const { data, error } = await notDeleted(
        db
          .from('news')
          .select('id, title, slug, deleted_at')
          .eq('tenant_id', tenantId)
      )
        .order('deleted_at', { ascending: false })
        .range(0, limit - 1);
      if (newsColumnMissing(error)) return [];
      return ((data || []) as DeletedNewsRow[]).map((n) => ({
        id: n.id,
        type: 'news' as const,
        name: n.title || 'Actualité sans titre',
        details: n.slug || null,
        deleted_at: n.deleted_at,
        tournament_id: null,
      }));
    },
  },
};

export function countDeleted(db: AdminDb, tenantId: string, type: DeletedType) {
  return SOURCES[type].buildCountQuery(untyped(db), tenantId);
}

export function fetchDeletedSlice(
  db: AdminDb,
  tenantId: string,
  type: DeletedType,
  limit: number
) {
  return SOURCES[type].fetchSlice(untyped(db), tenantId, limit);
}

/**
 * Restauration d'un élément. `partners`, `adherents`, `staff` : tables
 * GLOBALES, pas de filtre tenant (comportement historique).
 */
export async function restoreDeleted(
  db: AdminDb,
  tenantId: string,
  type: DeletedType,
  id: string,
  nowIso: string
): Promise<{ error: unknown }> {
  const u = untyped(db);
  switch (type) {
    case 'stage':
      return u
        .from('tournament_stages')
        .update({
          is_active: true,
          is_public: true,
          deleted_at: null,
          updated_at: nowIso,
        })
        .eq('id', id)
        .eq('tenant_id', tenantId);
    case 'team':
      return u
        .from('teams')
        .update({ is_active: true, deleted_at: null, updated_at: nowIso })
        .eq('id', id)
        .eq('tenant_id', tenantId);
    case 'match':
      return u
        .from('matches')
        .update({ status: 'pending', deleted_at: null, updated_at: nowIso })
        .eq('id', id)
        .eq('tenant_id', tenantId);
    case 'partner':
      return u
        .from('partners')
        .update({ is_active: true, deleted_at: null, updated_at: nowIso })
        .eq('id', id);
    case 'cast_member':
      return u
        .from('cast_members')
        .update({ is_active: true, deleted_at: null, updated_at: nowIso })
        .eq('id', id)
        .eq('tenant_id', tenantId);
    case 'adherent':
      // Un adhérent anonymisé par la purge ne se restaure pas.
      return u
        .from('adherents')
        .update({ is_active: true, deleted_at: null, updated_at: nowIso })
        .eq('id', id)
        .not('email', 'like', NOT_ANONYMIZED);
    case 'staff':
      // Rôle d'origine conservé (la ligne reste) ; `user_metadata.role` à
      // resynchroniser côté UI si nécessaire.
      return u
        .from('staff')
        .update({ is_active: true, deleted_at: null })
        .eq('id', id);
    case 'scrim':
      return u
        .from('scrims')
        .update({ deleted_at: null, updated_at: nowIso })
        .eq('id', id)
        .eq('tenant_id', tenantId);
    case 'scrim_planning':
      return u
        .from('scrim_plannings')
        .update({ deleted_at: null, updated_at: nowIso })
        .eq('id', id)
        .eq('tenant_id', tenantId);
    case 'news':
      // Revient en brouillon (la suppression l'y a mise) : à republier.
      return u
        .from('news')
        .update({ deleted_at: null, updated_at: nowIso })
        .eq('id', id)
        .eq('tenant_id', tenantId);
    case 'task':
      // Restaurée par le service via restoreTaskCore (repositionnement en bas
      // de colonne + journal Kanban) : jamais par ici.
      return { error: new Error('task restore goes through restoreTaskCore') };
  }
}
