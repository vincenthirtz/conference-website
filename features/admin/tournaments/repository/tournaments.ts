// features/admin/tournaments/repository/tournaments.ts — accès base des
// tournois côté staff : fiche, liste, création, modification, structure
// (phases, pool de maps). `tenantId` est un paramètre OBLIGATOIRE de chaque
// fonction : une requête non scopée ne s'écrit pas par accident.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import {
  STAGE_ROW_COLUMNS,
  TOURNAMENT_DETAIL_COLUMNS,
  TOURNAMENT_LOOKUP_COLUMNS,
  TOURNAMENT_LIST_COLUMNS,
  TOURNAMENT_ROW_COLUMNS,
} from '../schemas';

/* ---- Tournoi ---- */

/**
 * Le tournoi existe-t-il dans le tenant ? Une seule lecture « d'en-tête »
 * pour toutes les routes qui n'en lisent que quelques champs.
 */
export async function findTournament(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  return db
    .from('tournaments')
    .select(TOURNAMENT_LOOKUP_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
}

export async function getTournamentDetail(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  return db
    .from('tournaments')
    .select(TOURNAMENT_DETAIL_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
}

export async function getTournamentRow(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  return db
    .from('tournaments')
    .select(TOURNAMENT_ROW_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
}

/** Un autre tournoi du tenant porte-t-il déjà ce slug ? */
export async function findTournamentIdBySlug(
  db: AdminDb,
  tenantId: string,
  slug: string,
  excludeId?: string
) {
  let query = db
    .from('tournaments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('slug', slug);
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query.maybeSingle();
  return data;
}

export type TournamentListFilters = {
  withCount: boolean;
  status: string | null;
  search: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  orderBy: 'start_date' | 'created_at';
  ascending: boolean;
  offset: number;
  limit: number;
};

export async function listTournaments(
  db: AdminDb,
  tenantId: string,
  f: TournamentListFilters
) {
  let query = db
    .from('tournaments')
    .select(TOURNAMENT_LIST_COLUMNS, {
      count: f.withCount ? 'exact' : undefined,
    })
    .eq('tenant_id', tenantId);
  if (f.status) query = query.eq('status', f.status);
  if (f.search) {
    const s = `%${f.search}%`;
    query = query.or(`name.ilike.${s},slug.ilike.${s}`);
  }
  if (f.dateFrom) query = query.gte('start_date', f.dateFrom);
  if (f.dateTo) query = query.lte('start_date', f.dateTo);
  const { data, error, count } = await query
    .order(f.orderBy, { ascending: f.ascending })
    .range(f.offset, f.offset + f.limit - 1);
  return { rows: data ?? [], count, error };
}

export async function insertTournament(
  db: AdminDb,
  row: TablesInsert<'tournaments'>
) {
  return db
    .from('tournaments')
    .insert(row)
    .select(TOURNAMENT_ROW_COLUMNS)
    .maybeSingle();
}

export async function updateTournamentDetail(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'tournaments'>
) {
  return db
    .from('tournaments')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(TOURNAMENT_DETAIL_COLUMNS)
    .single();
}

/** Mise à jour simple (sans relecture) d'un tournoi du tenant. */
export async function updateTournament(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'tournaments'>
) {
  return db
    .from('tournaments')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', id);
}

export async function readOverlayDay(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  return db
    .from('tournaments')
    .select('id, overlay_day_date, overlay_day_set_at')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
}

/** Mise à jour du jour forcé de l'overlay, relue. */
export async function updateOverlayDay(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: { overlay_day_date: string | null; overlay_day_set_at: string | null }
) {
  return db
    .from('tournaments')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('id, overlay_day_date, overlay_day_set_at')
    .maybeSingle();
}

/* ---- Structure : phases, pool de maps ---- */

export async function listStages(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_stages')
    .select(STAGE_ROW_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true, nullsFirst: false });
}

/** Au moins une phase ? (gardes de transition de statut) */
export async function firstStageId(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournament_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .limit(1);
  return data;
}

/** Au moins une équipe inscrite ? (gardes de transition de statut) */
export async function firstTournamentTeamId(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournament_teams')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .limit(1);
  return data;
}

/** Phases existantes, la plus haute d'abord (ajout en fin de liste). */
export async function stagesByOrderDesc(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournament_stages')
    .select('id, order_index')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: false });
  return data ?? [];
}

export async function insertStages(
  db: AdminDb,
  rows: TablesInsert<'tournament_stages'>[]
) {
  return db.from('tournament_stages').insert(rows).select(STAGE_ROW_COLUMNS);
}

export async function insertStage(
  db: AdminDb,
  row: TablesInsert<'tournament_stages'>
) {
  return db
    .from('tournament_stages')
    .insert(row)
    .select(STAGE_ROW_COLUMNS)
    .single();
}

export async function updateStageOrder(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  stageId: string,
  orderIndex: number
) {
  return db
    .from('tournament_stages')
    .update({ order_index: orderIndex })
    .eq('id', stageId)
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);
}

/** Phases à recopier dans un clone (structure seule). */
export async function sourceStagesForClone(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournament_stages')
    .select('name, slug, stage_type, order_index, settings')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true });
  return data ?? [];
}

/**
 * Pool de maps PAR DÉFAUT à recopier dans un clone. Les pools par journée et
 * par date dépendent du calendrier du tournoi source, qui n'est pas celui du
 * nouveau. Filtrer `play_date` est indispensable : sans lui, un pool daté
 * serait recopié en pool par défaut (doublons refusés par l'index unique,
 * donc AUCUNE carte clonée).
 */
export async function sourceMapsForClone(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournament_maps')
    .select('map_name, map_slug, map_type, image_url, enabled, order_index')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .is('round_number', null)
    .is('play_date', null)
    .order('order_index', { ascending: true });
  return data ?? [];
}

export async function insertMaps(
  db: AdminDb,
  rows: TablesInsert<'tournament_maps'>[]
) {
  return db.from('tournament_maps').insert(rows);
}

/** Gabarits personnalisés du tenant (JSON dans `site_settings`). */
export async function readCustomTemplates(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('site_settings')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', 'custom_tournament_templates')
    .maybeSingle();
  return data?.value ?? null;
}
