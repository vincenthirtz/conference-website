// utils/broadcast/autoDirector.ts
//
// Feature: Production broadcast automatisée (roadmap #07).
//
// The auto-director reacts to match-status changes and flips the live run's
// broadcast "scene" so the chrome-less overlay (OBS browser source) switches
// automatically — no operator click required. It rides entirely on the
// existing `broadcast_state` JSONB (no new tables) and flows to consumers via
// event_runs Realtime + the admin console + the public overlay read API.
//
// CONTRACT: this is a BEST-EFFORT, NON-THROWING side-effect. It is invoked
// from match finalization paths (applyScore, matches/[matchId]) that must NOT
// fail because broadcast orchestration hiccuped. Every path is guarded and the
// function never rejects — mirrors how the sibling bot-event emits are wrapped.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import {
  fetchLiveBroadcastState,
  setBroadcastScene,
  type BroadcastScene,
} from './liveState';

export type ReactToMatchStatusParams = {
  tenantId: string;
  matchId: string;
  newStatus: string;
};

/**
 * Map a match status to the production scene it should trigger. Returns null
 * for statuses that carry no broadcast meaning (no-op).
 */
export function sceneForMatchStatus(status: string): BroadcastScene | null {
  switch (status) {
    case 'ongoing':
      return 'match';
    case 'finished':
    case 'walkover':
      return 'results';
    case 'disputed':
      return 'pause';
    default:
      return null;
  }
}

/**
 * React to a match-status change by switching the live run's broadcast scene,
 * but ONLY when the changed match is the one currently being cast (the live
 * segment's match) and the operator hasn't disabled auto_director.
 *
 * Never throws. Returns the scene that was applied, or null on any no-op /
 * failure (so callers can log if they care — they usually don't).
 */
export async function reactToMatchStatus(
  params: ReactToMatchStatusParams
): Promise<BroadcastScene | null> {
  try {
    const { tenantId, matchId, newStatus } = params;
    if (!tenantId || !matchId) return null;
    if (!supabaseAdmin) return null;

    const scene = sceneForMatchStatus(newStatus);
    if (!scene) return null; // status carries no broadcast meaning

    const live = await fetchLiveBroadcastState(tenantId);

    // No live run → nothing to drive.
    if (!live.run) return null;
    // Operator override: auto-director disabled for this run.
    if (live.state.auto_director === false) return null;
    // Only act on the match currently on the live segment.
    if (!live.currentSegment || live.currentSegment.match_id !== matchId) {
      return null;
    }

    const next = await setBroadcastScene(supabaseAdmin, live.run.id, scene);
    return next ? next.scene : null;
  } catch (e) {
    // Best-effort: swallow everything so match finalization is never impacted.
    logger.error('[broadcast/autoDirector] reactToMatchStatus error', e);
    return null;
  }
}
