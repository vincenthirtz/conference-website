// features/admin/twitch/service/predictions.ts — Predictions Twitch
// (création, dernière en cours, verrouillage / résolution / annulation).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { helixFetch } from '@/utils/twitchBroadcaster';
import type { Audited } from '../../_shared/audited';
import { CreatePredictionSchema, PatchPredictionSchema } from '../schemas';
import {
  fail,
  guardHelix,
  helixError,
  parsePayload,
  readJson,
  requireBroadcasterToken,
  requireScope,
} from './common';

const PREDICTIONS_SCOPE = 'channel:manage:predictions';
const WHERE = 'admin/twitch/predictions';

/** GET /twitch/predictions — la prediction la plus récente (ou null). */
export async function getLatestPrediction(
  ctx: ServiceContext
): Promise<{ prediction: unknown }> {
  const token = await requireBroadcasterToken(ctx, WHERE);
  const ERR = 'Twitch predictions fetch failed.';
  const prediction = await guardHelix(
    ctx,
    `[${WHERE}] helix list error`,
    ERR,
    async () => {
      const upstream = await helixFetch(
        token.accessToken,
        `/predictions?broadcaster_id=${encodeURIComponent(
          token.broadcasterId
        )}&first=1`,
        { method: 'GET' }
      );
      if (!upstream.ok) {
        ctx.logger.error(`[${WHERE}] helix list non-OK`, upstream.status);
        throw helixError(ERR);
      }
      const json = await readJson<{ data?: unknown[] }>(upstream);
      return json?.data?.[0] ?? null;
    }
  );
  return { prediction };
}

/** POST /twitch/predictions — crée une prediction (201). */
export async function createPrediction(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<{ prediction: unknown }>> {
  const { title, outcomes, prediction_window } = parsePayload(
    CreatePredictionSchema,
    rawBody
  );
  const token = await requireBroadcasterToken(ctx, WHERE);
  requireScope(token, PREDICTIONS_SCOPE);

  const ERR = 'Twitch prediction creation failed.';
  const prediction = await guardHelix(
    ctx,
    `[${WHERE}] helix create error`,
    ERR,
    async () => {
      const upstream = await helixFetch(token.accessToken, '/predictions', {
        method: 'POST',
        body: JSON.stringify({
          broadcaster_id: token.broadcasterId,
          title,
          outcomes: outcomes.map((t) => ({ title: t })),
          prediction_window,
        }),
      });
      const json = await readJson<{ data?: unknown[] }>(upstream);
      if (!upstream.ok) {
        ctx.logger.error(`[${WHERE}] helix create non-OK`, upstream.status);
        throw helixError(ERR);
      }
      return json?.data?.[0] ?? null;
    }
  );

  return {
    result: { prediction },
    audit: {
      entity_type: 'twitch_prediction',
      entity_id: (prediction as { id?: string } | null)?.id ?? null,
      payload: {
        action: 'create_twitch_prediction',
        title,
        outcomeCount: outcomes.length,
        prediction_window,
      },
    },
  };
}

/** PATCH /twitch/predictions/[id] — LOCKED / RESOLVED / CANCELED. */
export async function updatePrediction(
  ctx: ServiceContext,
  rawId: unknown,
  rawBody: unknown
): Promise<Audited<{ prediction: unknown }>> {
  const predictionId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (typeof predictionId !== 'string' || predictionId.trim().length === 0) {
    throw fail(400, 'Invalid prediction id.');
  }
  const { status, winning_outcome_id } = parsePayload(
    PatchPredictionSchema,
    rawBody
  );
  const where = 'admin/twitch/predictions/[id]';
  const token = await requireBroadcasterToken(ctx, where);
  requireScope(token, PREDICTIONS_SCOPE);

  const patchBody: Record<string, unknown> = {
    broadcaster_id: token.broadcasterId,
    id: predictionId,
    status,
  };
  if (status === 'RESOLVED' && winning_outcome_id) {
    patchBody.winning_outcome_id = winning_outcome_id;
  }

  const ERR = 'Twitch prediction update failed.';
  const prediction = await guardHelix(
    ctx,
    `[${where}] helix patch error`,
    ERR,
    async () => {
      const upstream = await helixFetch(token.accessToken, '/predictions', {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      });
      if (!upstream.ok) {
        ctx.logger.error(`[${where}] helix patch non-OK`, upstream.status);
        throw helixError(ERR);
      }
      const json = await readJson<{ data?: unknown[] }>(upstream);
      return json?.data?.[0] ?? null;
    }
  );

  return {
    result: { prediction },
    audit: {
      entity_type: 'twitch_prediction',
      entity_id: predictionId,
      payload: {
        action: 'update_twitch_prediction',
        status,
        hasWinner: !!winning_outcome_id,
      },
    },
  };
}
