// pages/api/admin/broadcast/state.ts
// Lot 7 Broadcast Console — admin endpoint.
//   GET  : aggregate live state (run + current segment + match + casters
//          + overlay state).
//   POST : partial update of broadcast_state on the currently-live run.
//
// The endpoint always operates on the SINGLE live run of the tenant
// (status='live'). If no run is live, GET returns nullish fields and
// POST returns 409.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logStaffAction } from '@/utils/staffLogs';
import { emitBotEvent } from '@/utils/botEvents';
import {
  fetchLiveBroadcastState,
  updateBroadcastState,
  BROADCAST_SCENES,
} from '@/utils/broadcast/liveState';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
import { logger } from '../../../../utils/logger';

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'broadcast-state' }),
  'caster'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  try {
    // La régie vidéo est une capacité de palier (`broadcastStudio`). Elle
    // n'était gatée nulle part : un espace « Régie » y accédait comme le plan
    // au-dessus, et rien dans le code ne distinguait 29 € de 79 € sur l'axe
    // production. Le contrôle porte sur la CONSOLE, pas sur l'overlay lui-même
    // — celui-ci est la sortie vidéo, la couper n'apprendrait rien à personne.
    const denial = await capabilityDenial(
      ctx.tenantId,
      'broadcastStudio',
      'La régie vidéo (direction automatique et overlays OBS) fait partie du plan Circuit et au-dessus.'
    );
    if (denial) return res.status(402).json(denial);

    if (req.method === 'GET') {
      const data = await fetchLiveBroadcastState(ctx.tenantId);
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        on_air?: unknown;
        lower_third?: unknown;
        pip?: unknown;
        scene?: unknown;
        auto_director?: unknown;
      };

      // Validate the patch up-front so we fail fast before touching the DB.
      const patch: Record<string, unknown> = {};
      if (body.on_air !== undefined) {
        if (typeof body.on_air !== 'boolean') {
          return res.status(400).json({ error: 'on_air must be a boolean' });
        }
        patch.on_air = body.on_air;
      }
      if (body.lower_third !== undefined) {
        if (body.lower_third !== null && typeof body.lower_third !== 'string') {
          return res
            .status(400)
            .json({ error: 'lower_third must be a string or null' });
        }
        if (
          typeof body.lower_third === 'string' &&
          body.lower_third.length > 500
        ) {
          return res
            .status(400)
            .json({ error: 'lower_third too long (max 500 chars)' });
        }
        patch.lower_third = body.lower_third;
      }
      if (body.pip !== undefined) {
        if (
          !body.pip ||
          typeof body.pip !== 'object' ||
          typeof (body.pip as any).enabled !== 'boolean'
        ) {
          return res
            .status(400)
            .json({ error: 'pip must be { enabled: boolean }' });
        }
        patch.pip = { enabled: (body.pip as any).enabled };
      }
      if (body.scene !== undefined) {
        if (
          typeof body.scene !== 'string' ||
          !(BROADCAST_SCENES as readonly string[]).includes(body.scene)
        ) {
          return res.status(400).json({
            error: `scene must be one of: ${BROADCAST_SCENES.join(', ')}`,
          });
        }
        patch.scene = body.scene;
      }
      if (body.auto_director !== undefined) {
        if (typeof body.auto_director !== 'boolean') {
          return res
            .status(400)
            .json({ error: 'auto_director must be a boolean' });
        }
        patch.auto_director = body.auto_director;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Find the current live run for the tenant — required since we patch
      // its broadcast_state. Manager can update; caster reads only.
      if (ctx.staff.role === 'caster') {
        return res.status(403).json({ error: 'Caster cannot edit state' });
      }

      const current = await fetchLiveBroadcastState(ctx.tenantId);
      if (!current.run) {
        return res.status(409).json({
          error: 'No live event_run for this tenant. Start a run first.',
          code: 'NO_LIVE_RUN',
        });
      }

      const next = await updateBroadcastState(
        ctx.tenantId,
        current.run.id,
        patch as never
      );
      if (!next) {
        return res
          .status(500)
          .json({ error: 'Failed to update broadcast_state' });
      }

      if (ctx?.staff?.id) {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'broadcast_state_update',
          entity_type: 'event_run',
          entity_id: current.run.id,
          tournament_id: null,
          payload: { patch, new_state: next },
          tenant_id: ctx.tenantId,
        });
      }

      // Best-effort outbox event so the bot can refresh the lives-board
      // panel without waiting for the next poll tick.
      try {
        await emitBotEvent(
          'broadcast.state_changed',
          {
            runId: current.run.id,
            runSlug: current.run.slug,
            state: next,
            currentSegmentId: current.currentSegment?.id ?? null,
            matchId: current.match?.matchId ?? null,
          },
          ctx.tenantId
        );
      } catch (e) {
        logger.error('[broadcast/state] emitBotEvent error', e);
      }

      const refreshed = await fetchLiveBroadcastState(ctx.tenantId);
      return res.status(200).json(refreshed);
    }

    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    logger.error('[/api/admin/broadcast/state] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
