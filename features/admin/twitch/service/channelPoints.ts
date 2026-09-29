// features/admin/twitch/service/channelPoints.ts — points de chaîne :
// récompenses (liste / création / modification / suppression) et demandes
// (liste / résolution).
//
// ⚠️ Helix ne gère QUE les récompenses créées par NOTRE client_id
//    (only_manageable_rewards). Voir le caveat dans BOT_API_CONTRACT.md.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { helixFetch } from '@/utils/twitchBroadcaster';
import { GetQuerySchema as RedemptionsQuerySchema } from '@/lib/apiContracts/admin/twitch/channel-points/redemptions.query';
import type { Audited } from '../../_shared/audited';
import {
  CreateRewardSchema,
  PatchRedemptionsSchema,
  UpdateRewardSchema,
} from '../schemas';
import {
  fail,
  guardHelix,
  helixError,
  parsePayload,
  readJson,
  requireBroadcasterToken,
  requireScope,
} from './common';

const REDEMPTIONS_READ_SCOPE = 'channel:read:redemptions';
const REDEMPTIONS_MANAGE_SCOPE = 'channel:manage:redemptions';
const REWARDS = 'admin/twitch/channel-points/rewards';
const REWARD_BY_ID = 'admin/twitch/channel-points/rewards/id';
const REDEMPTIONS = 'admin/twitch/channel-points/redemptions';

const enc = encodeURIComponent;

/** 400 / 403 Helix remontés tels quels, le reste en 502. */
function helixWriteFailure(status: number, message: string) {
  const out = status === 400 || status === 403 ? status : 502;
  return fail(
    out,
    message,
    out === 400
      ? 'TWITCH_HELIX_BAD_REQUEST'
      : out === 403
        ? 'TWITCH_HELIX_FORBIDDEN'
        : 'TWITCH_HELIX_ERROR'
  );
}

/* ------------------------------ Récompenses ------------------------------ */

/**
 * GET /twitch/channel-points/rewards — `?all=1` lève le filtre
 * `only_manageable_rewards` (lecture seule : on récupère l'identifiant d'une
 * récompense créée à la main, cf. drop TCG).
 */
export async function listRewards(
  ctx: ServiceContext,
  rawAll: unknown
): Promise<{ rewards: unknown[] }> {
  const token = await requireBroadcasterToken(ctx, REWARDS);
  requireScope(token, REDEMPTIONS_READ_SCOPE);
  const listAll = rawAll === '1' || rawAll === 'true';

  const ERR = 'Twitch rewards fetch failed.';
  const rewards = await guardHelix(
    ctx,
    `[${REWARDS}] helix list error`,
    ERR,
    async () => {
      const upstream = await helixFetch(
        token.accessToken,
        `/channel_points/custom_rewards?broadcaster_id=${enc(
          token.broadcasterId
        )}&only_manageable_rewards=${listAll ? 'false' : 'true'}`,
        { method: 'GET' }
      );
      if (!upstream.ok) {
        ctx.logger.error(`[${REWARDS}] helix list non-OK`, upstream.status);
        throw helixError(ERR);
      }
      const json = await readJson<{ data?: unknown[] }>(upstream);
      return json?.data ?? [];
    }
  );
  return { rewards };
}

/** POST /twitch/channel-points/rewards — crée une récompense. */
export async function createReward(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<{ reward: { id?: string } | null }>> {
  const body = parsePayload(CreateRewardSchema, rawBody);
  const token = await requireBroadcasterToken(ctx, REWARDS);
  requireScope(token, REDEMPTIONS_MANAGE_SCOPE);

  // Corps Helix : typé depuis le schéma parsé (pas d'input brut).
  const helixBody: Record<string, unknown> = {
    title: body.title,
    cost: body.cost,
    is_enabled: body.is_enabled,
  };
  if (body.prompt !== undefined) helixBody.prompt = body.prompt;
  if (body.is_user_input_required !== undefined)
    helixBody.is_user_input_required = body.is_user_input_required;
  if (body.background_color !== undefined)
    helixBody.background_color = body.background_color;
  if (body.should_redemptions_skip_request_queue !== undefined)
    helixBody.should_redemptions_skip_request_queue =
      body.should_redemptions_skip_request_queue;

  const reward = await guardHelix(
    ctx,
    `[${REWARDS}] helix create error`,
    'Twitch reward creation failed.',
    async () => {
      const upstream = await helixFetch(
        token.accessToken,
        `/channel_points/custom_rewards?broadcaster_id=${enc(
          token.broadcasterId
        )}`,
        { method: 'POST', body: JSON.stringify(helixBody) }
      );
      const json = await readJson<{
        data?: { id?: string }[];
        message?: string;
      }>(upstream);
      if (!upstream.ok) {
        ctx.logger.error(`[${REWARDS}] helix create non-OK`, upstream.status);
        // Remonte proprement les erreurs Helix (ex. 400 titre en double).
        const status = upstream.status === 400 ? 400 : 502;
        throw fail(
          status,
          json?.message ||
            'Twitch reward creation failed. Seuls les rewards créés par notre application sont gérables.',
          status === 400 ? 'TWITCH_HELIX_BAD_REQUEST' : 'TWITCH_HELIX_ERROR'
        );
      }
      return json?.data?.[0] ?? null;
    }
  );

  return {
    result: { reward },
    audit: {
      entity_type: 'twitch_reward',
      entity_id: reward?.id ?? null,
      payload: {
        action: 'create_twitch_reward',
        title: body.title,
        cost: body.cost,
      },
    },
  };
}

/** `[id]` d'une récompense : chaîne non vide, sinon 400 historique. */
function rewardIdOf(raw: unknown): string {
  const id = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof id === 'string' ? id.trim() : '';
  if (!trimmed) {
    throw fail(400, 'Missing reward id.', 'INVALID_PAYLOAD');
  }
  return trimmed;
}

/** PATCH /twitch/channel-points/rewards/[id]. */
export async function updateReward(
  ctx: ServiceContext,
  rawId: unknown,
  rawBody: unknown
): Promise<Audited<{ reward: { id?: string } | null }>> {
  const rewardId = rewardIdOf(rawId);
  const body = parsePayload(UpdateRewardSchema, rawBody);
  const token = await requireBroadcasterToken(ctx, REWARD_BY_ID);
  requireScope(token, REDEMPTIONS_MANAGE_SCOPE);

  // Corps Helix : typé depuis le schéma parsé (pas d'input brut).
  const helixBody: Record<string, unknown> = {};
  if (body.is_enabled !== undefined) helixBody.is_enabled = body.is_enabled;
  if (body.is_paused !== undefined) helixBody.is_paused = body.is_paused;
  if (body.title !== undefined) helixBody.title = body.title;
  if (body.cost !== undefined) helixBody.cost = body.cost;
  if (body.prompt !== undefined) helixBody.prompt = body.prompt;

  const reward = await guardHelix(
    ctx,
    `[${REWARD_BY_ID}] helix update error`,
    'Twitch reward update failed.',
    async () => {
      const upstream = await helixFetch(
        token.accessToken,
        `/channel_points/custom_rewards?broadcaster_id=${enc(
          token.broadcasterId
        )}&id=${enc(rewardId)}`,
        { method: 'PATCH', body: JSON.stringify(helixBody) }
      );
      const json = await readJson<{
        data?: { id?: string }[];
        message?: string;
      }>(upstream);
      if (!upstream.ok) {
        ctx.logger.error(
          `[${REWARD_BY_ID}] helix update non-OK`,
          upstream.status
        );
        throw helixWriteFailure(
          upstream.status,
          json?.message ||
            'Twitch reward update failed. Seuls les rewards créés par notre application sont éditables.'
        );
      }
      return json?.data?.[0] ?? null;
    }
  );

  return {
    result: { reward },
    audit: {
      entity_type: 'twitch_reward',
      entity_id: rewardId,
      payload: {
        action: 'update_twitch_reward',
        fields: Object.keys(helixBody),
      },
    },
  };
}

/** DELETE /twitch/channel-points/rewards/[id]. */
export async function deleteReward(
  ctx: ServiceContext,
  rawId: unknown
): Promise<Audited<{ ok: true }>> {
  const rewardId = rewardIdOf(rawId);
  const token = await requireBroadcasterToken(ctx, REWARD_BY_ID);
  requireScope(token, REDEMPTIONS_MANAGE_SCOPE);

  await guardHelix(
    ctx,
    `[${REWARD_BY_ID}] helix delete error`,
    'Twitch reward deletion failed.',
    async () => {
      const upstream = await helixFetch(
        token.accessToken,
        `/channel_points/custom_rewards?broadcaster_id=${enc(
          token.broadcasterId
        )}&id=${enc(rewardId)}`,
        { method: 'DELETE' }
      );
      if (!upstream.ok) {
        const json = await readJson<{ message?: string }>(upstream);
        ctx.logger.error(
          `[${REWARD_BY_ID}] helix delete non-OK`,
          upstream.status
        );
        throw helixWriteFailure(
          upstream.status,
          json?.message ||
            'Twitch reward deletion failed. Seuls les rewards créés par notre application sont supprimables.'
        );
      }
    }
  );

  return {
    result: { ok: true },
    audit: {
      entity_type: 'twitch_reward',
      entity_id: rewardId,
      payload: { action: 'delete_twitch_reward' },
    },
  };
}

/* -------------------------------- Demandes -------------------------------- */

/** GET /twitch/channel-points/redemptions?reward_id=&status=. */
export async function listRedemptions(
  ctx: ServiceContext,
  rawQuery: unknown
): Promise<{ redemptions: unknown[] }> {
  const parsed = RedemptionsQuerySchema.safeParse(rawQuery ?? {});
  if (!parsed.success) {
    throw fail(400, 'Invalid query.', 'INVALID_PAYLOAD', {
      details: parsed.error.flatten(),
    });
  }
  const { reward_id, status } = parsed.data;
  const token = await requireBroadcasterToken(ctx, REDEMPTIONS);
  requireScope(token, REDEMPTIONS_READ_SCOPE);

  const ERR = 'Twitch redemptions fetch failed.';
  const redemptions = await guardHelix(
    ctx,
    `[${REDEMPTIONS}] helix list error`,
    ERR,
    async () => {
      const upstream = await helixFetch(
        token.accessToken,
        `/channel_points/custom_rewards/redemptions?broadcaster_id=${enc(
          token.broadcasterId
        )}&reward_id=${enc(reward_id)}&status=${enc(status)}`,
        { method: 'GET' }
      );
      if (!upstream.ok) {
        ctx.logger.error(`[${REDEMPTIONS}] helix list non-OK`, upstream.status);
        throw helixError(ERR);
      }
      const json = await readJson<{ data?: unknown[] }>(upstream);
      return json?.data ?? [];
    }
  );
  return { redemptions };
}

/** PATCH /twitch/channel-points/redemptions — FULFILLED / CANCELED en lot. */
export async function updateRedemptions(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<{ redemptions: unknown[] }>> {
  const { reward_id, redemption_ids, status } = parsePayload(
    PatchRedemptionsSchema,
    rawBody
  );
  const token = await requireBroadcasterToken(ctx, REDEMPTIONS);
  requireScope(token, REDEMPTIONS_MANAGE_SCOPE);

  const idParams = redemption_ids.map((id) => `&id=${enc(id)}`).join('');
  const ERR = 'Twitch redemptions update failed.';
  const redemptions = await guardHelix(
    ctx,
    `[${REDEMPTIONS}] helix patch error`,
    ERR,
    async () => {
      const upstream = await helixFetch(
        token.accessToken,
        `/channel_points/custom_rewards/redemptions?broadcaster_id=${enc(
          token.broadcasterId
        )}&reward_id=${enc(reward_id)}${idParams}`,
        { method: 'PATCH', body: JSON.stringify({ status }) }
      );
      if (!upstream.ok) {
        ctx.logger.error(
          `[${REDEMPTIONS}] helix patch non-OK`,
          upstream.status
        );
        throw helixError(ERR);
      }
      const json = await readJson<{ data?: unknown[] }>(upstream);
      return json?.data ?? [];
    }
  );

  return {
    result: { redemptions },
    audit: {
      entity_type: 'twitch_redemption',
      entity_id: reward_id,
      payload: {
        action: 'update_twitch_redemptions',
        status,
        count: redemption_ids.length,
      },
    },
  };
}
