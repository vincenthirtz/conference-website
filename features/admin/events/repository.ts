// features/admin/events/repository.ts — accès base du run-of-show côté staff
// (event_runs, event_segments, event_waves, event_stations, event_cues,
// présence des casters). `tenantId` est un paramètre OBLIGATOIRE de chaque
// fonction : une requête non scopée ne s'écrit pas par accident.
//
// Les requêtes sont celles des routes d'origine, à l'identique (colonnes,
// filtres, ordre) : la migration déplace, elle ne réécrit pas.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import {
  CUE_COLUMNS,
  RUN_COLUMNS,
  RUN_DETAIL_COLUMNS,
  RUN_END_LOOKUP_COLUMNS,
  RUN_START_LOOKUP_COLUMNS,
  SEGMENT_COLUMNS,
  SEGMENT_DETAIL_COLUMNS,
  SEGMENT_END_LOOKUP_COLUMNS,
  SEGMENT_SKIP_LOOKUP_COLUMNS,
  SEGMENT_TRANSITION_COLUMNS,
  STATION_COLUMNS,
  WAVE_COLUMNS,
} from './schemas';

type Ordered = 'event_segments' | 'event_waves' | 'event_stations';

/* ---- Runs ---- */

export async function listRuns(
  db: AdminDb,
  tenantId: string,
  f: { status: string | null; offset: number; limit: number }
) {
  let query = db
    .from('event_runs')
    .select(RUN_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .range(f.offset, f.offset + f.limit - 1);
  if (f.status) query = query.eq('status', f.status);
  const { data, error, count } = await query;
  return { rows: data, error, count };
}

/** Un run du tenant porte-t-il déjà ce slug (hors `excludeId`) ? */
export async function findRunIdBySlug(
  db: AdminDb,
  tenantId: string,
  slug: string,
  excludeId?: string
) {
  let query = db
    .from('event_runs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('slug', slug);
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query.maybeSingle();
  return data;
}

export async function insertRun(
  db: AdminDb,
  row: TablesInsert<'event_runs'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('event_runs')
    .insert(row)
    .select(RUN_COLUMNS)
    .single();
  return { row: data, error };
}

export async function getRunDetail(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data, error } = await db
    .from('event_runs')
    .select(RUN_DETAIL_COLUMNS)
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/** Existence + statut d'un run (création de segments, cues, préremplissage). */
export async function getRunStatus(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data, error } = await db
    .from('event_runs')
    .select('id, tenant_id, status')
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/** Existence seule d'un run (listes, reorder, présence). */
export async function getRunRef(db: AdminDb, tenantId: string, runId: string) {
  const { data, error } = await db
    .from('event_runs')
    .select('id, tenant_id')
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function getRunForStart(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data, error } = await db
    .from('event_runs')
    .select(RUN_START_LOOKUP_COLUMNS)
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function getRunForEnd(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data, error } = await db
    .from('event_runs')
    .select(RUN_END_LOOKUP_COLUMNS)
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/** Relecture après une transition perdue (course) : état courant du run. */
export async function refetchRun(db: AdminDb, tenantId: string, runId: string) {
  const { data } = await db
    .from('event_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function updateRun(
  db: AdminDb,
  tenantId: string,
  runId: string,
  patch: TablesUpdate<'event_runs'>
) {
  const { data, error } = await db
    .from('event_runs')
    .update(patch)
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .select(RUN_COLUMNS)
    .single();
  return { row: data, error };
}

/**
 * Transition conditionnelle de statut (`draft → live`, `live → done`) : ne
 * touche le run QUE s'il est encore dans `fromStatus` (garde de course).
 */
export async function transitionRun(
  db: AdminDb,
  tenantId: string,
  runId: string,
  fromStatus: string,
  patch: TablesUpdate<'event_runs'>
) {
  const { data, error } = await db
    .from('event_runs')
    .update(patch)
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .eq('status', fromStatus)
    .select(RUN_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

export async function getRunStatusOnly(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data, error } = await db
    .from('event_runs')
    .select('status')
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/** Suppression, jamais d'un run en direct (`neq('status','live')`). */
export async function deleteRunUnlessLive(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { error } = await db
    .from('event_runs')
    .delete()
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .neq('status', 'live');
  return { error };
}

/* ---- Enfants d'un run (segments / vagues / postes) ---- */

export async function listRunSegments(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data, error } = await db
    .from('event_segments')
    .select(SEGMENT_COLUMNS)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .order('ord', { ascending: true });
  return { rows: data, error };
}

export async function listRunWaves(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data, error } = await db
    .from('event_waves')
    .select(WAVE_COLUMNS)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .order('ord', { ascending: true });
  return { rows: data, error };
}

export async function listRunStations(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data, error } = await db
    .from('event_stations')
    .select(STATION_COLUMNS)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .order('ord', { ascending: true })
    .order('name', { ascending: true });
  return { rows: data, error };
}

/** Plus grand `ord` d'une table enfant du run (file d'attente : MAX+1). */
export async function lastOrd(
  db: AdminDb,
  table: Ordered,
  tenantId: string,
  runId: string
): Promise<number | null> {
  const { data } = await db
    .from(table)
    .select('ord')
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .order('ord', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? (data.ord as number) : null;
}

/** Ids d'une table enfant du run (validation d'un reorder). */
export async function listChildIds(
  db: AdminDb,
  table: 'event_segments' | 'event_waves',
  tenantId: string,
  runId: string
) {
  const { data, error } = await db
    .from(table)
    .select('id')
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId);
  return { rows: data, error };
}

/** Écrit l'`ord` d'une ligne enfant (les deux phases d'un reorder). */
export async function setChildOrd(
  db: AdminDb,
  table: 'event_segments' | 'event_waves',
  tenantId: string,
  runId: string,
  id: string,
  ord: number
) {
  const { error } = await db
    .from(table)
    .update({ ord })
    .eq('id', id)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId);
  return { error };
}

/* ---- Segments ---- */

export async function findMatchTenant(db: AdminDb, matchId: string) {
  // Lecture par id seul, comme la route d'origine : c'est le tenant LU qui
  // est comparé à celui du staff par le service.
  const { data } = await db
    .from('matches')
    .select('id, tenant_id')
    .eq('id', matchId)
    .maybeSingle();
  return data;
}

export async function findSegmentAtOrd(
  db: AdminDb,
  tenantId: string,
  runId: string,
  ord: number
) {
  const { data } = await db
    .from('event_segments')
    .select('id')
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .eq('ord', ord)
    .maybeSingle();
  return data;
}

export async function insertSegment(
  db: AdminDb,
  row: TablesInsert<'event_segments'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('event_segments')
    .insert(row)
    .select(SEGMENT_COLUMNS)
    .single();
  return { row: data, error };
}

export async function insertSegments(
  db: AdminDb,
  rows: Array<TablesInsert<'event_segments'> & { tenant_id: string }>
) {
  const { data, error } = await db
    .from('event_segments')
    .insert(rows)
    .select(SEGMENT_COLUMNS);
  return { rows: data, error };
}

export async function getSegmentDetail(
  db: AdminDb,
  tenantId: string,
  runId: string,
  segId: string
) {
  const { data, error } = await db
    .from('event_segments')
    .select(SEGMENT_DETAIL_COLUMNS)
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function getSegmentForEnd(
  db: AdminDb,
  tenantId: string,
  runId: string,
  segId: string
) {
  const { data, error } = await db
    .from('event_segments')
    .select(SEGMENT_END_LOOKUP_COLUMNS)
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function getSegmentForSkip(
  db: AdminDb,
  tenantId: string,
  runId: string,
  segId: string
) {
  const { data, error } = await db
    .from('event_segments')
    .select(SEGMENT_SKIP_LOOKUP_COLUMNS)
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/** Transition conditionnelle de statut d'un segment (garde de course). */
export async function transitionSegment(
  db: AdminDb,
  tenantId: string,
  runId: string,
  segId: string,
  fromStatus: string,
  patch: TablesUpdate<'event_segments'>
) {
  const { data, error } = await db
    .from('event_segments')
    .update(patch)
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .eq('status', fromStatus)
    .select(SEGMENT_TRANSITION_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

/** Relecture après une transition perdue (course) : état courant du segment. */
export async function refetchSegment(
  db: AdminDb,
  tenantId: string,
  segId: string
) {
  const { data } = await db
    .from('event_segments')
    .select(SEGMENT_TRANSITION_COLUMNS)
    .eq('id', segId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

/** Clôture en masse des segments d'un run qui sont dans `fromStatus`. */
export async function closeRunSegments(
  db: AdminDb,
  tenantId: string,
  runId: string,
  fromStatus: 'live' | 'upcoming',
  patch: TablesUpdate<'event_segments'>
) {
  await db
    .from('event_segments')
    .update(patch)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .eq('status', fromStatus);
}

export async function updateSegment(
  db: AdminDb,
  tenantId: string,
  runId: string,
  segId: string,
  patch: TablesUpdate<'event_segments'>
) {
  const { data, error } = await db
    .from('event_segments')
    .update(patch)
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .select(SEGMENT_COLUMNS)
    .single();
  return { row: data, error };
}

export async function deleteSegment(
  db: AdminDb,
  tenantId: string,
  runId: string,
  segId: string
) {
  const { error } = await db
    .from('event_segments')
    .delete()
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId);
  return { error };
}

/** Segments après un reorder, dans leur nouvel ordre. */
export async function listSegmentsAfterReorder(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data } = await db
    .from('event_segments')
    .select(SEGMENT_TRANSITION_COLUMNS)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .order('ord', { ascending: true });
  return data;
}

/** `match_id` déjà présents dans les segments du run (anti-doublon). */
export async function listRunSegmentMatchIds(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data } = await db
    .from('event_segments')
    .select('match_id')
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId);
  return data ?? [];
}

/** Segments du run réduits à ce que la présence des casters lit. */
export async function listRunSegmentMatches(
  db: AdminDb,
  tenantId: string,
  runId: string
) {
  const { data, error } = await db
    .from('event_segments')
    .select('id, type, match_id')
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId);
  return { rows: data, error };
}

export async function findWaveInRun(
  db: AdminDb,
  tenantId: string,
  runId: string,
  waveId: string
) {
  const { data } = await db
    .from('event_waves')
    .select('id')
    .eq('id', waveId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function findStationInRun(
  db: AdminDb,
  tenantId: string,
  runId: string,
  stationId: string
) {
  const { data } = await db
    .from('event_stations')
    .select('id')
    .eq('id', stationId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

/* ---- Préremplissage (scrim / tournoi) ---- */

export async function findScrim(
  db: AdminDb,
  tenantId: string,
  scrimId: string
) {
  const { data } = await db
    .from('scrims')
    .select('id, tenant_id, name')
    .eq('id', scrimId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function listScrimMatches(
  db: AdminDb,
  tenantId: string,
  scrimId: string
) {
  const { data, error } = await db
    .from('matches')
    .select('id, scheduled_at, created_at, team1_id, team2_id')
    .eq('tenant_id', tenantId)
    .eq('scrim_id', scrimId)
    .neq('status', 'cancelled');
  return { rows: data, error };
}

export async function findTournament(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournaments')
    .select('id, tenant_id')
    .eq('id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function listTournamentMatches(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data, error } = await db
    .from('matches')
    .select(
      'id, stage_id, round_number, scheduled_at, created_at, round_name, team1_id, team2_id'
    )
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .neq('status', 'cancelled');
  return { rows: data, error };
}

export async function listTournamentStageOrder(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournament_stages')
    .select('id, order_index')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);
  return data ?? [];
}

export async function listTeamNames(
  db: AdminDb,
  tenantId: string,
  teamIds: string[]
) {
  const { data } = await db
    .from('teams')
    .select('id, name, short_name')
    .eq('tenant_id', tenantId)
    .in('id', teamIds);
  return data ?? [];
}

/* ---- Vagues / postes ---- */

export async function insertWave(
  db: AdminDb,
  row: TablesInsert<'event_waves'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('event_waves')
    .insert(row)
    .select(WAVE_COLUMNS)
    .single();
  return { row: data, error };
}

export async function getWave(
  db: AdminDb,
  tenantId: string,
  runId: string,
  waveId: string
) {
  const { data, error } = await db
    .from('event_waves')
    .select(WAVE_COLUMNS)
    .eq('id', waveId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function updateWave(
  db: AdminDb,
  tenantId: string,
  runId: string,
  waveId: string,
  patch: TablesUpdate<'event_waves'>
) {
  const { data, error } = await db
    .from('event_waves')
    .update(patch)
    .eq('id', waveId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .select(WAVE_COLUMNS)
    .single();
  return { row: data, error };
}

export async function deleteWave(
  db: AdminDb,
  tenantId: string,
  runId: string,
  waveId: string
) {
  const { error } = await db
    .from('event_waves')
    .delete()
    .eq('id', waveId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId);
  return { error };
}

export async function insertStation(
  db: AdminDb,
  row: TablesInsert<'event_stations'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('event_stations')
    .insert(row)
    .select(STATION_COLUMNS)
    .single();
  return { row: data, error };
}

export async function getStation(
  db: AdminDb,
  tenantId: string,
  runId: string,
  stationId: string
) {
  const { data, error } = await db
    .from('event_stations')
    .select(STATION_COLUMNS)
    .eq('id', stationId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function updateStation(
  db: AdminDb,
  tenantId: string,
  runId: string,
  stationId: string,
  patch: TablesUpdate<'event_stations'>
) {
  const { data, error } = await db
    .from('event_stations')
    .update(patch)
    .eq('id', stationId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .select(STATION_COLUMNS)
    .single();
  return { row: data, error };
}

export async function deleteStation(
  db: AdminDb,
  tenantId: string,
  runId: string,
  stationId: string
) {
  const { error } = await db
    .from('event_stations')
    .delete()
    .eq('id', stationId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId);
  return { error };
}

/* ---- Cues ---- */

export async function insertCue(
  db: AdminDb,
  row: TablesInsert<'event_cues'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('event_cues')
    .insert(row)
    .select(CUE_COLUMNS)
    .single();
  return { row: data, error };
}

export async function findCueByDedupKey(
  db: AdminDb,
  tenantId: string,
  dedupKey: string
) {
  const { data, error } = await db
    .from('event_cues')
    .select(CUE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('dedup_key', dedupKey)
    .maybeSingle();
  return { row: data, error };
}

export async function listCues(
  db: AdminDb,
  tenantId: string,
  runId: string,
  limit: number
) {
  const { data, error } = await db
    .from('event_cues')
    .select(CUE_COLUMNS)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { rows: data, error };
}

export async function listCueAcks(
  db: AdminDb,
  tenantId: string,
  cueIds: string[]
) {
  const { data, error } = await db
    .from('event_cue_acks')
    .select('cue_id, cast_member_id, acked_at, cast_members(name)')
    .in('cue_id', cueIds)
    .eq('tenant_id', tenantId);
  return { rows: data, error };
}

export async function getCue(
  db: AdminDb,
  tenantId: string,
  runId: string,
  cueId: string
) {
  const { data, error } = await db
    .from('event_cues')
    .select(CUE_COLUMNS)
    .eq('id', cueId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function retractCue(
  db: AdminDb,
  tenantId: string,
  cueId: string,
  patch: { retracted_at: string; retracted_by_user_id: string | null }
) {
  const { data, error } = await db
    .from('event_cues')
    .update(patch)
    .eq('id', cueId)
    .eq('tenant_id', tenantId)
    .select(CUE_COLUMNS)
    .single();
  return { row: data, error };
}

/* ---- Présence des casters ---- */

export async function listCastAssignmentMembers(
  db: AdminDb,
  tenantId: string,
  matchIds: string[]
) {
  const { data, error } = await db
    .from('cast_assignments')
    .select('cast_member_id')
    .eq('tenant_id', tenantId)
    .in('match_id', matchIds);
  return { rows: data, error };
}

export async function listCastMembersByIds(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data, error } = await db
    .from('cast_members')
    .select('id, name, image_url, is_active')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return { rows: data, error };
}

export async function listCasterPresence(
  db: AdminDb,
  tenantId: string,
  castMemberIds: string[]
) {
  const { data, error } = await db
    .from('caster_presence')
    .select('cast_member_id, event_run_id, last_seen_at, user_agent')
    .eq('tenant_id', tenantId)
    .in('cast_member_id', castMemberIds);
  return { rows: data, error };
}
