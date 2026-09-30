// features/admin/events/schemas.ts — entrées et colonnes des routes staff du
// run-of-show (`/api/admin/events/**`) : runs, segments, cues, présence des
// casters, vagues (waves) et postes (stations).
//
// Les corps ne passent PAS par la validation de `defineAdminRoute` : leur
// erreur historique (`{ error: 'Invalid payload.', code: 'INVALID_PAYLOAD',
// details }`) est lue telle quelle par la régie, et le 404 du run passait
// AVANT elle sur plusieurs routes. La route déclare donc un `looseBody` qui
// NOMME les champs pour la spec ; le service applique le vrai schéma
// ci-dessous, dans l'ordre d'origine.
//
// zod seul, imports RELATIFS : ces schémas sont référencés par la spec
// OpenAPI (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.

import * as z from 'zod';
import {
  looseBody,
  looseQuery,
  uuidPathParam,
} from '../../../utils/admin/pathParams';

/* ---------------------------------------------------------------------------
 * Colonnes (listes explicites, reprises à l'identique des routes d'origine)
 * ------------------------------------------------------------------------ */

/** Run renvoyé par la liste, la création, la mise à jour, start/end. */
export const RUN_COLUMNS =
  'id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at' as const;

/** Fiche d'un run (GET /events/[runId]) : + tenant_id. */
export const RUN_DETAIL_COLUMNS =
  'id, tenant_id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at' as const;

/** État lu avant /start (renvoyé tel quel si déjà live). */
export const RUN_START_LOOKUP_COLUMNS =
  'id, status, started_at, ended_at, name, slug, scheduled_at, description, tenant_id' as const;

/** État lu avant /end (renvoyé tel quel si déjà done). */
export const RUN_END_LOOKUP_COLUMNS =
  'id, status, started_at, ended_at, tenant_id' as const;

/** Segment complet (création, fiche du run, préremplissage, PATCH). */
export const SEGMENT_COLUMNS =
  'id, ord, type, match_id, wave_id, station_id, title, duration_min, planned_start_at, status, started_at, ended_at, broadcast_message, caster_checklist, obs_scene, created_at, updated_at' as const;

/** Fiche d'un segment (GET /segments/[segId]). */
export const SEGMENT_DETAIL_COLUMNS =
  'id, event_run_id, tenant_id, ord, type, match_id, wave_id, station_id, title, duration_min, status, started_at, ended_at, broadcast_message, caster_checklist, obs_scene, created_at, updated_at' as const;

/** Segment renvoyé par /end, /skip et /reorder (sans wave/station/planned). */
export const SEGMENT_TRANSITION_COLUMNS =
  'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, caster_checklist, obs_scene, created_at, updated_at' as const;

/** État lu avant /end d'un segment (renvoyé tel quel si déjà done). */
export const SEGMENT_END_LOOKUP_COLUMNS =
  'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, tenant_id' as const;

/** État lu avant /skip d'un segment (renvoyé tel quel si déjà skipped). */
export const SEGMENT_SKIP_LOOKUP_COLUMNS =
  'id, ord, type, match_id, title, duration_min, status, broadcast_message, tenant_id' as const;

export const WAVE_COLUMNS =
  'id, tenant_id, event_run_id, ord, title, planned_start_at, duration_min, status, started_at, ended_at, created_at, updated_at' as const;

export const STATION_COLUMNS =
  'id, tenant_id, event_run_id, ord, name, stream_url, notes, status, created_at, updated_at' as const;

export const CUE_COLUMNS =
  'id, event_run_id, severity, body, created_by_user_id, created_at, expires_at, dedup_key, retracted_at, retracted_by_user_id' as const;

/* ---------------------------------------------------------------------------
 * Paramètres de chemin et de requête (messages historiques)
 * ------------------------------------------------------------------------ */

const runId = uuidPathParam('Invalid runId.');

/** `/events/[runId]/…` */
export const RunIdQuery = z.object({ runId });

/** `/events/[runId]/segments/[segId]/…` */
export const SegmentIdQuery = z.object({
  runId,
  segId: uuidPathParam('Invalid segId.'),
});

/** `/events/[runId]/waves/[waveId]` */
export const WaveIdQuery = z.object({
  runId,
  waveId: uuidPathParam('Invalid waveId.'),
});

/** `/events/[runId]/stations/[stationId]` */
export const StationIdQuery = z.object({
  runId,
  stationId: uuidPathParam('Invalid stationId.'),
});

/** `/events/[runId]/cues/[cueId]` */
export const CueIdQuery = z.object({
  runId,
  cueId: uuidPathParam('Invalid cueId.'),
});

/** GET /events : filtres lus et normalisés par le service (comme avant). */
export const RunListQuery = looseQuery(['status', 'limit', 'offset']);

/** GET /events/[runId]/cues : `limit` borné par le service (1..100, défaut 50). */
export const CueListQuery = z.looseObject({
  runId,
  limit: z.unknown().optional(),
});

/* ---------------------------------------------------------------------------
 * Corps — schémas appliqués par le service
 * ------------------------------------------------------------------------ */

export const CreateRunBody = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  scheduled_at: z
    .string()
    .datetime({ message: 'scheduled_at doit etre un ISO 8601 datetime.' }),
});

export const UpdateRunBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    slug: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    scheduled_at: z.string().datetime().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit etre fourni.',
  });

const SegmentTypeSchema = z.enum([
  'match',
  'break',
  'intro',
  'outro',
  'custom',
]);

const ChecklistItemSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  checked_by_user_id: z.string().uuid().nullable().optional(),
  checked_at: z.string().datetime().nullable().optional(),
});

const BroadcastMessageSchema = z
  .object({
    discord: z.string().max(2000).optional(),
    push_title: z.string().max(200).optional(),
    push_body: z.string().max(500).optional(),
    email_subject: z.string().max(200).optional(),
  })
  .strict()
  .nullable();

export const CreateSegmentBody = z
  .object({
    type: SegmentTypeSchema,
    title: z.string().trim().min(1).max(200),
    ord: z.number().int().nonnegative().optional(),
    match_id: z.string().uuid().nullable().optional(),
    duration_min: z.number().int().positive().nullable().optional(),
    // Lot 6 timing : ancrage horaire absolu optionnel. NULL = computed cote UI.
    planned_start_at: z.string().datetime().nullable().optional(),
    broadcast_message: BroadcastMessageSchema.optional(),
    caster_checklist: z.array(ChecklistItemSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'match' && !data.match_id) {
      ctx.addIssue({
        code: 'custom',
        message: "type='match' impose match_id.",
        path: ['match_id'],
      });
    }
  });

export const UpdateSegmentBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    duration_min: z.number().int().positive().nullable().optional(),
    // Lot 6 timing : override ancrage horaire absolu. null = unlock.
    planned_start_at: z.string().datetime().nullable().optional(),
    // Waves + Stations : null = détaché ; la wave/station doit être du run.
    wave_id: z.string().uuid().nullable().optional(),
    station_id: z.string().uuid().nullable().optional(),
    broadcast_message: BroadcastMessageSchema.optional(),
    caster_checklist: z.array(ChecklistItemSchema).optional(),
    // Nom de scène OBS : accepté par le schéma, mais NON écrit par la route
    // d'origine (absent de son `updatePayload`) — comportement conservé tel
    // quel par la migration, cf. le rapport de migration.
    obs_scene: z.string().trim().max(200).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit etre fourni.',
  });

export const ReorderSegmentsBody = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});

export const FromScrimBody = z.object({ scrim_id: z.string().uuid() }).strict();

export const FromTournamentBody = z
  .object({ tournament_id: z.string().uuid() })
  .strict();

export const CreateCueBody = z.object({
  severity: z.enum(['info', 'warn', 'urgent']),
  body: z.string().trim().min(1).max(500),
  // Lot 6 — clé de dédoublonnage logique partagée entre le client
  // (useOverrunWatcher) et le cron overrun-watcher : un partial UNIQUE INDEX
  // garantit au plus un cue par clé ; le second writer reçoit 200
  // `dedupReplayed: true`.
  dedup_key: z.string().trim().min(1).max(200).optional(),
});

export const CreateWaveBody = z.object({
  title: z.string().trim().min(1).max(200),
  planned_start_at: z.string().datetime().nullable().optional(),
  duration_min: z.number().int().positive().nullable().optional(),
  ord: z.number().int().nonnegative().optional(),
});

export const UpdateWaveBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    planned_start_at: z.string().datetime().nullable().optional(),
    duration_min: z.number().int().positive().nullable().optional(),
    status: z.enum(['upcoming', 'live', 'done', 'skipped']).optional(),
    started_at: z.string().datetime().nullable().optional(),
    ended_at: z.string().datetime().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit etre fourni.',
  });

export const ReorderWavesBody = z.object({
  order: z
    .array(
      z.object({
        id: z.string().uuid(),
        ord: z.number().int().nonnegative(),
      })
    )
    .min(1)
    .max(200),
});

export const CreateStationBody = z.object({
  name: z.string().trim().min(1).max(100),
  stream_url: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  ord: z.number().int().nonnegative().optional(),
});

export const UpdateStationBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    stream_url: z.string().trim().max(2000).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(['idle', 'in_use', 'offline']).optional(),
    ord: z.number().int().nonnegative().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit etre fourni.',
  });

/* ---------------------------------------------------------------------------
 * Corps déclarés par les routes (champs NOMMÉS pour la spec, non contraints)
 * ------------------------------------------------------------------------ */

export const CreateRunDoc = looseBody([
  'name',
  'slug',
  'description',
  'scheduled_at',
]);
export const UpdateRunDoc = looseBody([
  'name',
  'slug',
  'description',
  'scheduled_at',
]);
export const CreateSegmentDoc = looseBody([
  'type',
  'title',
  'ord',
  'match_id',
  'duration_min',
  'planned_start_at',
  'broadcast_message',
  'caster_checklist',
]);
export const UpdateSegmentDoc = looseBody([
  'title',
  'duration_min',
  'planned_start_at',
  'wave_id',
  'station_id',
  'broadcast_message',
  'caster_checklist',
  'obs_scene',
]);
export const ReorderSegmentsDoc = looseBody(['orderedIds']);
export const FromScrimDoc = looseBody(['scrim_id']);
export const FromTournamentDoc = looseBody(['tournament_id']);
export const CreateCueDoc = looseBody(['severity', 'body', 'dedup_key']);
export const CreateWaveDoc = looseBody([
  'title',
  'planned_start_at',
  'duration_min',
  'ord',
]);
export const UpdateWaveDoc = looseBody([
  'title',
  'planned_start_at',
  'duration_min',
  'status',
  'started_at',
  'ended_at',
]);
export const ReorderWavesDoc = looseBody(['order']);
export const CreateStationDoc = looseBody([
  'name',
  'stream_url',
  'notes',
  'ord',
]);
export const UpdateStationDoc = looseBody([
  'name',
  'stream_url',
  'notes',
  'status',
  'ord',
]);
