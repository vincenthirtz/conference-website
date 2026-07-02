// types/events.ts
// Types centralises pour la feature "Run-of-show" (event_runs + event_segments).
// Cf. pages/api/admin/events/** pour le contrat backend et
// memory/feature-run-of-show.md pour le pourquoi.

export type EventRunStatus = 'draft' | 'live' | 'done';

export type EventSegmentType = 'match' | 'break' | 'intro' | 'outro' | 'custom';

export type EventSegmentStatus = 'upcoming' | 'live' | 'done' | 'skipped';

export type EventBroadcastMessage = {
  discord?: string;
  push_title?: string;
  push_body?: string;
  email_subject?: string;
};

export type EventCasterChecklistItem = {
  key: string;
  label: string;
  checked_by_user_id?: string | null;
  checked_at?: string | null;
};

export type EventRun = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  scheduled_at: string;
  status: EventRunStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string | null;
};

/**
 * Statut d'une wave (regroupement logique de segments, cf. migration
 * create_event_waves_and_stations_tables.sql).
 */
export type EventWaveStatus = 'upcoming' | 'live' | 'done' | 'skipped';

/** Statut d'une station de production (poste caster/stream). */
export type EventStationStatus = 'idle' | 'in_use' | 'offline';

/**
 * Wave : regroupement ordonne de segments dans un event_run (ex : "Poules
 * matin", "Finale"). tenant_id denormalise depuis le run (meme rationale que
 * event_segments : filtre realtime/SQL sans JOIN).
 */
export type EventWave = {
  id: string;
  tenant_id: string;
  event_run_id: string;
  ord: number;
  title: string;
  planned_start_at: string | null;
  duration_min: number | null;
  status: EventWaveStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string | null;
};

/**
 * Station : poste de production (stream/caster) rattachable a des segments.
 */
export type EventStation = {
  id: string;
  tenant_id: string;
  event_run_id: string;
  ord: number;
  name: string;
  stream_url: string | null;
  notes: string | null;
  status: EventStationStatus;
  created_at: string;
  updated_at: string | null;
};

export type EventSegment = {
  id: string;
  ord: number;
  type: EventSegmentType;
  match_id: string | null;
  /** Wave a laquelle ce segment est rattache (NULL = non assigne). */
  wave_id: string | null;
  /** Station de production assignee a ce segment (NULL = non assigne). */
  station_id: string | null;
  title: string;
  duration_min: number | null;
  status: EventSegmentStatus;
  started_at: string | null;
  ended_at: string | null;
  /**
   * Ancrage horaire absolu optionnel (override du Director).
   * - NULL  = mode computed : planned calcule a la volee via
   *           run.scheduled_at + sum(duration_min) des segments precedents.
   * - Set   = mode ancre : ce segment demarre a HH:MM peu importe la derive
   *           amont. UI affiche un cadenas.
   * Cf. migration add_planned_start_at_to_event_segments.sql (lot 6 timing/drift).
   */
  planned_start_at: string | null;
  broadcast_message: EventBroadcastMessage | null;
  caster_checklist: EventCasterChecklistItem[];
  created_at: string;
  updated_at: string | null;
};

/** Reponse de GET /api/admin/events/[runId]. */
export type EventRunWithSegments = {
  run: EventRun;
  segments: EventSegment[];
  waves: EventWave[];
  stations: EventStation[];
};

// ---------------------------------------------------------------------------
// Cues + presence (3e brique run-of-show, cf. migration
// create_event_cues_and_presence_tables.sql).
// ---------------------------------------------------------------------------

/**
 * Severite d'un cue Director -> casters.
 * - info  : FYI, pas d'ack requis.
 * - warn  : attention, pas d'ack requis.
 * - urgent: action requise, ack obligatoire (tracé dans event_cue_acks).
 */
export type EventCueSeverity = 'info' | 'warn' | 'urgent';

/**
 * Cue (message court) broadcast par le Director vers tous les casters
 * connectes a un event_run. Append-only cote DB.
 */
export type EventCue = {
  id: string;
  event_run_id: string;
  severity: EventCueSeverity;
  body: string;
  created_by_user_id: string | null;
  created_at: string;
  expires_at: string | null;
  /**
   * Clef de dedup logique partagee entre le client (useOverrunWatcher dans le
   * Director tab) et le cron server-side `overrun-watcher-cron`. Si renseignee,
   * un partial UNIQUE INDEX cote DB garantit qu'au plus un cue existe par
   * dedup_key. Convention auto-overrun T+5min : `auto-overrun:{runId}:{segmentId}`.
   * NULL pour les cues manuels du Director (hors partial unique).
   */
  dedup_key: string | null;
};

/**
 * Ack d'un cue urgent par un cast_member. PK composite (cue_id,
 * cast_member_id) cote DB = un caster ne ack qu'une fois.
 */
export type EventCueAck = {
  cue_id: string;
  cast_member_id: string;
  acked_at: string;
};

/**
 * Statut de presence DERIVE a la lecture depuis caster_presence.last_seen_at.
 * Seuils :
 *   - online  : last_seen_at >= now() - 60s
 *   - idle    : now() - 180s <= last_seen_at < now() - 60s
 *   - offline : last_seen_at < now() - 180s (ou row absente)
 */
export type CasterPresenceStatus = 'online' | 'idle' | 'offline';

/**
 * Etat brut de presence cote DB. 1 row par caster (PK = cast_member_id),
 * UPSERT au heartbeat (toutes les 20s depuis le cockpit). Le statut
 * online/idle/offline n'est PAS stocke ; il se calcule depuis last_seen_at
 * a la lecture.
 */
export type CasterPresence = {
  cast_member_id: string;
  event_run_id: string | null;
  last_seen_at: string;
  user_agent: string | null;
  updated_at: string;
};
