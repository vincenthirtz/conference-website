// hooks/useOverrunWatcher.ts
//
// Feature: Run-of-show — Lot 6 (timing/drift) escalation 3-niveaux.
//
// Surveille le segment 'live' du run courant et declenche :
//   - T+2min de depassement : chime 'warn' (1 fois par segment).
//   - T+5min de depassement : envoi d'un cue 'urgent' templated (1 fois par
//     segment). Le caller fournit `sendAutoCue` qui POST cote serveur — le
//     hook ne connait pas l'API, il sait juste appeler le callback.
//     IMPORTANT : la cle de dedup `auto-overrun:{runId}:{segmentId}` doit
//     etre passee par le caller dans le body POST (champ `dedup_key`) — c'est
//     ce qui permet au cron server-side `overrun-watcher-cron` (fallback si
//     l'onglet est ferme) de partager le verrou DB avec ce hook.
//
// Le visuel "pulse amber" (T+0) est dans le composant SegmentCard, pas ici.
//
// Garde-fous :
//   - Un trigger par segment : on maintient deux Sets refs (chimedSegments,
//     autoCuedSegments). Quand le segment 'live' change, on reset les sets —
//     une nouvelle fenetre = une nouvelle chance pour le chime/cue.
//   - Tick 1s via setInterval. On consomme `liveOverrunSec` du schedule
//     passe en prop (le parent recalcule a chaque now-tick).
//   - sendAutoCue() est appele "fire-and-forget" cote hook — c'est le caller
//     qui gere l'idempotency-key et le toast d'erreur. On marque le segment
//     comme "auto-cued" AVANT l'await pour eviter le double-fire si le
//     re-render arrive avant la resolution.

import { useEffect, useRef } from 'react';
import { playChime } from '@/utils/playChime';
import { logger } from '@/utils/logger';
import type { ComputedRunSchedule } from '@/utils/eventSchedule';
import type { EventSegment } from '@/types/events';

const CHIME_THRESHOLD_SEC = 120; // T+2min
const AUTO_CUE_THRESHOLD_SEC = 300; // T+5min

type UseOverrunWatcherArgs = {
  runId: string | null;
  schedule: ComputedRunSchedule | null;
  segments: EventSegment[];
  /**
   * Envoie un cue 'urgent' auto. Le caller doit gerer l'Idempotency-Key
   * (typiquement derivee du segmentId pour assurer idempotence DB-side meme
   * en cas de double-mount du hook).
   */
  sendAutoCue: (segmentId: string, body: string) => Promise<void>;
  /** Optionnel : disable le watcher (ex: tests, ou run non-live). */
  enabled?: boolean;
};

export function useOverrunWatcher({
  runId,
  schedule,
  segments,
  sendAutoCue,
  enabled = true,
}: UseOverrunWatcherArgs): void {
  // Sets persistents — on garde la trace meme entre re-renders.
  const chimedRef = useRef<Set<string>>(new Set());
  const autoCuedRef = useRef<Set<string>>(new Set());
  const lastLiveIdRef = useRef<string | null>(null);

  // Ref pour ne pas re-creer l'interval a chaque render. On lit toujours la
  // valeur la plus fraiche du schedule/segments via une ref intermediaire.
  // L'assignement se fait dans un effect (rule react-hooks/refs : pas de
  // mutation de ref pendant le render).
  const stateRef = useRef({ schedule, segments, sendAutoCue, runId });
  useEffect(() => {
    stateRef.current = { schedule, segments, sendAutoCue, runId };
  }, [schedule, segments, sendAutoCue, runId]);

  useEffect(() => {
    if (!enabled) return;
    if (!runId) return;

    let cancelled = false;

    function tick() {
      if (cancelled) return;
      const {
        schedule: sched,
        segments: segs,
        sendAutoCue: send,
      } = stateRef.current;
      if (!sched) return;
      const liveId = sched.liveSegmentId;

      // Si le segment live a change (nouveau segment OU plus de live), on
      // reset les sets pour la NOUVELLE fenetre. C'est intentionnel : si un
      // segment a deja chimee et qu'on revient sur un autre, on doit pouvoir
      // re-chimer pour le nouveau.
      if (liveId !== lastLiveIdRef.current) {
        chimedRef.current.clear();
        autoCuedRef.current.clear();
        lastLiveIdRef.current = liveId;
      }

      if (!liveId) return;
      const overrunSec = sched.liveOverrunSec;
      if (overrunSec <= 0) return;

      const seg = segs.find((s) => s.id === liveId);
      if (!seg) return;

      // T+2min : chime warn.
      if (overrunSec >= CHIME_THRESHOLD_SEC && !chimedRef.current.has(liveId)) {
        chimedRef.current.add(liveId);
        try {
          playChime('warn');
        } catch (err) {
          logger.error('[overrun-watcher] chime failed', err);
        }
      }

      // T+5min : auto-cue urgent.
      if (
        overrunSec >= AUTO_CUE_THRESHOLD_SEC &&
        !autoCuedRef.current.has(liveId)
      ) {
        // Mark BEFORE await pour eviter le double-fire en cas de re-render
        // synchrone avant resolution.
        autoCuedRef.current.add(liveId);
        const body = `OVERRUN: "${seg.title}" en depassement de 5min — cloturer ou prolonger ?`;
        send(liveId, body).catch((err) => {
          logger.error('[overrun-watcher] auto-cue failed', err);
          // Note : on NE retire PAS le segment du set en cas d'echec.
          // L'envoi peut avoir touche le serveur ; un retry creerait un
          // doublon meme si l'Idempotency-Key joue (clef stable par segment
          // donc le retry serait replayed cote serveur — ok mais inutile).
          // Le Director peut renvoyer manuellement si besoin.
        });
      }
    }

    const intervalId = setInterval(tick, 1000);
    // Tick immediatement aussi pour ne pas attendre 1s sur mount.
    tick();
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [runId, enabled]);
}
