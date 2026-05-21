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

export type EventSegment = {
  id: string;
  ord: number;
  type: EventSegmentType;
  match_id: string | null;
  title: string;
  duration_min: number | null;
  status: EventSegmentStatus;
  started_at: string | null;
  ended_at: string | null;
  broadcast_message: EventBroadcastMessage | null;
  caster_checklist: EventCasterChecklistItem[];
  created_at: string;
  updated_at: string | null;
};

/** Reponse de GET /api/admin/events/[runId]. */
export type EventRunWithSegments = {
  run: EventRun;
  segments: EventSegment[];
};
