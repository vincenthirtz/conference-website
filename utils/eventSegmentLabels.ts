// utils/eventSegmentLabels.ts
// Libelles francais + helpers visuels (icones) pour la feature
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

/* -----------------------------------------------------------
 * Statuts de wave (memes valeurs que segment)
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
