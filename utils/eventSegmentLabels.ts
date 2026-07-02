// utils/eventSegmentLabels.ts
// Libelles francais + helpers visuels (couleurs/icones) pour la feature
// "Run-of-show". Importer ces helpers depuis les composants admin pour eviter
// de re-declarer les memes maps a chaque endroit.

import type {
  EventRunStatus,
  EventSegmentStatus,
  EventSegmentType,
  EventStationStatus,
  EventWaveStatus,
} from '@/types/events';

/* -----------------------------------------------------------
 * Types de segment
 * ---------------------------------------------------------*/

export const SEGMENT_TYPE_LABEL: Record<EventSegmentType, string> = {
  match: 'Match',
  break: 'Pause',
  intro: 'Intro',
  outro: 'Outro',
  custom: 'Personnalise',
};

export const SEGMENT_TYPE_ICON: Record<EventSegmentType, string> = {
  match: 'M',
  break: 'P',
  intro: 'I',
  outro: 'O',
  custom: 'C',
};

export function segmentTypeLabel(type: EventSegmentType | string): string {
  return SEGMENT_TYPE_LABEL[type as EventSegmentType] ?? String(type);
}

/* -----------------------------------------------------------
 * Statuts de segment
 * ---------------------------------------------------------*/

export const SEGMENT_STATUS_LABEL: Record<EventSegmentStatus, string> = {
  upcoming: 'A venir',
  live: 'En direct',
  done: 'Termine',
  skipped: 'Passe',
};

export function segmentStatusLabel(
  status: EventSegmentStatus | string
): string {
  return SEGMENT_STATUS_LABEL[status as EventSegmentStatus] ?? String(status);
}

/**
 * Tailwind classes pour un badge de statut de segment.
 * Couleurs alignees sur la palette globale admin (neutral/emerald/red/blue).
 */
export function segmentStatusBadgeClasses(
  status: EventSegmentStatus | string
): string {
  switch (status) {
    case 'live':
      return 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300';
    case 'done':
      return 'bg-neutral-700/50 border border-neutral-600/40 text-neutral-200';
    case 'skipped':
      return 'bg-amber-500/15 border border-amber-500/40 text-amber-300';
    case 'upcoming':
    default:
      return 'bg-blue-500/15 border border-blue-500/40 text-blue-300';
  }
}

/**
 * Couleur du dot (point clignotant si live).
 */
export function segmentStatusDotClasses(
  status: EventSegmentStatus | string
): string {
  switch (status) {
    case 'live':
      return 'bg-emerald-400 animate-pulse';
    case 'done':
      return 'bg-neutral-400';
    case 'skipped':
      return 'bg-amber-400';
    case 'upcoming':
    default:
      return 'bg-blue-400';
  }
}

/* -----------------------------------------------------------
 * Statuts de run
 * ---------------------------------------------------------*/

export const RUN_STATUS_LABEL: Record<EventRunStatus, string> = {
  draft: 'Brouillon',
  live: 'En direct',
  done: 'Termine',
};

export function runStatusLabel(status: EventRunStatus | string): string {
  return RUN_STATUS_LABEL[status as EventRunStatus] ?? String(status);
}

export function runStatusBadgeClasses(status: EventRunStatus | string): string {
  switch (status) {
    case 'live':
      return 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300';
    case 'done':
      return 'bg-neutral-700/50 border border-neutral-600/40 text-neutral-200';
    case 'draft':
    default:
      return 'bg-neutral-600/40 border border-neutral-500/40 text-neutral-200';
  }
}

export function runStatusDotClasses(status: EventRunStatus | string): string {
  switch (status) {
    case 'live':
      return 'bg-emerald-400 animate-pulse';
    case 'done':
      return 'bg-neutral-400';
    case 'draft':
    default:
      return 'bg-neutral-300';
  }
}

/* -----------------------------------------------------------
 * Statuts de wave (memes valeurs que segment : on reutilise le style)
 * ---------------------------------------------------------*/

export const WAVE_STATUS_LABEL: Record<EventWaveStatus, string> = {
  upcoming: 'A venir',
  live: 'En direct',
  done: 'Termine',
  skipped: 'Passe',
};

export function waveStatusLabel(status: EventWaveStatus | string): string {
  return WAVE_STATUS_LABEL[status as EventWaveStatus] ?? String(status);
}

/** Reutilise exactement le style des badges de segment (memes statuts). */
export function waveStatusBadgeClasses(
  status: EventWaveStatus | string
): string {
  return segmentStatusBadgeClasses(status);
}

export function waveStatusDotClasses(status: EventWaveStatus | string): string {
  return segmentStatusDotClasses(status);
}

/* -----------------------------------------------------------
 * Statuts de station de production
 * ---------------------------------------------------------*/

export const STATION_STATUS_LABEL: Record<EventStationStatus, string> = {
  idle: 'Libre',
  in_use: 'En service',
  offline: 'Hors ligne',
};

export function stationStatusLabel(
  status: EventStationStatus | string
): string {
  return STATION_STATUS_LABEL[status as EventStationStatus] ?? String(status);
}

export function stationStatusBadgeClasses(
  status: EventStationStatus | string
): string {
  switch (status) {
    case 'in_use':
      return 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300';
    case 'offline':
      return 'bg-red-500/15 border border-red-500/40 text-red-300';
    case 'idle':
    default:
      return 'bg-neutral-600/40 border border-neutral-500/40 text-neutral-200';
  }
}

export function stationStatusDotClasses(
  status: EventStationStatus | string
): string {
  switch (status) {
    case 'in_use':
      return 'bg-emerald-400 animate-pulse';
    case 'offline':
      return 'bg-red-400';
    case 'idle':
    default:
      return 'bg-neutral-300';
  }
}
