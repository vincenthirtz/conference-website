// utils/eventSchedule.ts
//
// Calcul pur du planning d'un EventRun (Lot 6 — feature run-of-show, mode
// hybride computed/anchored).
//
// Pourquoi un util pur ?
//   - Le Director cockpit (UI staff) ET la Caster PWA ont besoin de connaitre
//     les horaires planifies de CHAQUE segment + le drift cumule + l'overrun
//     du segment courant. Les deux derivent la meme info des memes inputs (run
//     + segments) → on extrait le calcul ici plutot que de le dupliquer dans
//     deux composants React.
//   - Pure function = facilement testable et injectable (`nowMs` en arg).
//
// Mode hybride :
//   - planned_start_at = NULL  → computed : cursor = previousEnd
//   - planned_start_at = set   → anchored : cursor saute au timestamp d'ancre
//     (peu importe le delta vs computed). Pas de validation : on affiche tel
//     quel et le Director gere les conflits (ex: chevauchement).

import type { EventSegment } from '@/types/events';

/**
 * Timing calcule pour un segment. Toujours present pour les segments NON
 * `skipped` retournes dans `ComputedRunSchedule.segments`.
 */
export type ComputedSegmentTiming = {
  segmentId: string;
  /** Horaire prevu (toujours rempli, computed ou override). ISO string. */
  plannedStartAt: string;
  /** True si l'horaire vient de planned_start_at (override Director). */
  isAnchored: boolean;
  /** Duree planifiee en secondes (duration_min * 60, ou 0 si null). */
  plannedDurationSec: number;
  /** Horaire de fin prevu (plannedStartAt + plannedDurationSec). ISO string. */
  plannedEndAt: string;
};

export type ComputedRunSchedule = {
  segments: ComputedSegmentTiming[];
  /** Drift cumule en secondes vs planning : positif = en retard, negatif = en avance. */
  driftSec: number;
  /** Segment courant (status === 'live'), null si aucun. */
  liveSegmentId: string | null;
  /** Overrun du segment courant en secondes (>0 si en depassement). 0 sinon. */
  liveOverrunSec: number;
};

/**
 * Calcule le planning complet d'un run.
 *
 * @param run       Le run, avec son `scheduled_at` (planifie) et `started_at`
 *                  (reel, null tant que le run n'est pas live).
 * @param segments  Les segments du run, dans n'importe quel ordre. Filtres
 *                  par `skipped` (ils ne consomment pas de temps planifie) et
 *                  tries par `ord` croissant en interne.
 * @param nowMs     Horloge injectable pour les tests (defaut: Date.now()).
 */
export function computeRunSchedule(
  run: { scheduled_at: string; started_at: string | null },
  segments: EventSegment[],
  nowMs: number = Date.now()
): ComputedRunSchedule {
  // 1. Tri par ord croissant + filtrage des skipped.
  // Les skipped ne consomment pas de temps planifie : on les retire du walk.
  const activeSegments = segments
    .filter((seg) => seg.status !== 'skipped')
    .slice()
    .sort((a, b) => a.ord - b.ord);

  // 2. Anchor de depart :
  //    - Si le run est live (started_at set), on consomme l'horaire reel de
  //      demarrage : tout le planning aval est rebase sur le started_at.
  //    - Sinon, on planifie depuis le scheduled_at (planifie initial).
  const runStartMs = new Date(
    run.started_at ?? run.scheduled_at
  ).getTime();

  // 3. Walk forward : pour chaque segment dans l'ordre, on calcule son
  //    plannedStartAt soit depuis le cursor (computed) soit depuis l'override
  //    (anchored).
  let cursorMs = runStartMs;
  const computed: ComputedSegmentTiming[] = [];

  for (const seg of activeSegments) {
    let startMs: number;
    let isAnchored = false;

    if (seg.planned_start_at) {
      // Override Director : on saute au timestamp d'ancre, peu importe le
      // delta vs cursor (overlap ou trou). Pas de validation ici.
      startMs = new Date(seg.planned_start_at).getTime();
      isAnchored = true;
    } else {
      // Mode computed : on enchaine depuis la fin du segment precedent.
      startMs = cursorMs;
    }

    const plannedDurationSec = (seg.duration_min ?? 0) * 60;
    const endMs = startMs + plannedDurationSec * 1000;

    computed.push({
      segmentId: seg.id,
      plannedStartAt: new Date(startMs).toISOString(),
      isAnchored,
      plannedDurationSec,
      plannedEndAt: new Date(endMs).toISOString(),
    });

    // Avance le cursor a la fin de ce segment (qu'il soit anchored ou non :
    // un anchored "redefinit" le cursor pour la suite).
    cursorMs = endMs;
  }

  // 4. Drift cumule :
  //    - Run pas demarre → 0 (rien a mesurer, le planning est purement
  //      previsionnel).
  //    - Sinon, on prend le DERNIER segment 'done' (timing reel le plus
  //      recent) → drift = ended_at − plannedEndAt.
  //    - Sinon, si un segment est 'live' → drift = started_at − plannedStartAt
  //      (mesure du retard au demarrage du segment courant).
  //    - Sinon (run live mais aucun segment touche encore) → 0.
  let driftSec = 0;
  if (run.started_at) {
    let lastDoneTiming: ComputedSegmentTiming | null = null;
    let lastDoneSeg: EventSegment | null = null;
    let liveTiming: ComputedSegmentTiming | null = null;
    let liveSeg: EventSegment | null = null;

    for (const seg of activeSegments) {
      const timing = computed.find((c) => c.segmentId === seg.id);
      if (!timing) continue;
      if (seg.status === 'done' && seg.ended_at) {
        // On garde le dernier 'done' rencontre (segments deja tries par ord).
        lastDoneTiming = timing;
        lastDoneSeg = seg;
      } else if (seg.status === 'live' && seg.started_at) {
        liveTiming = timing;
        liveSeg = seg;
      }
    }

    if (lastDoneSeg && lastDoneTiming && lastDoneSeg.ended_at) {
      driftSec =
        (new Date(lastDoneSeg.ended_at).getTime() -
          new Date(lastDoneTiming.plannedEndAt).getTime()) /
        1000;
    } else if (liveSeg && liveTiming && liveSeg.started_at) {
      driftSec =
        (new Date(liveSeg.started_at).getTime() -
          new Date(liveTiming.plannedStartAt).getTime()) /
        1000;
    }
  }

  // 5. liveSegmentId + liveOverrunSec :
  //    Cherche le segment 'live'. Overrun = depassement de la duree planifiee
  //    par rapport a `now`. Si duration_min est null on ne peut pas mesurer
  //    un overrun (segment-jalon sans duree) → 0.
  let liveSegmentId: string | null = null;
  let liveOverrunSec = 0;
  const liveSeg = activeSegments.find((s) => s.status === 'live');
  if (liveSeg && liveSeg.started_at) {
    liveSegmentId = liveSeg.id;
    if (liveSeg.duration_min != null) {
      const startedMs = new Date(liveSeg.started_at).getTime();
      const plannedDurationMs = liveSeg.duration_min * 60 * 1000;
      const overrunMs = nowMs - startedMs - plannedDurationMs;
      liveOverrunSec = Math.max(0, overrunMs / 1000);
    }
  }

  return {
    segments: computed,
    driftSec,
    liveSegmentId,
    liveOverrunSec,
  };
}
