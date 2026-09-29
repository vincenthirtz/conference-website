// features/admin/twitch/service/actions.ts — gestes régie sur la chaîne du
// broadcaster connecté : chat, clip, marker, modération (ban / clear /
// chat-settings). Ordre d'origine : corps → jeton → scope → Helix.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { helixFetch } from '@/utils/twitchBroadcaster';
import type { Audited } from '../../_shared/audited';
import {
  BanSchema,
  ChatSettingsSchema,
  MarkerSchema,
  SendChatSchema,
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

const CHAT_SCOPE = 'user:write:chat';
const CLIP_SCOPE = 'clips:edit';
const BROADCAST_SCOPE = 'channel:manage:broadcast';
const BAN_SCOPE = 'moderator:manage:banned_users';
const CLEAR_SCOPE = 'moderator:manage:chat_messages';
const CHAT_SETTINGS_SCOPE = 'moderator:manage:chat_settings';

const enc = encodeURIComponent;

/** POST /twitch/chat — message dans le chat de la chaîne. */
export async function sendChat(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<{ result: unknown }>> {
  const { message } = parsePayload(SendChatSchema, rawBody);
  const token = await requireBroadcasterToken(ctx, 'admin/twitch/chat');
  requireScope(token, CHAT_SCOPE);

  const ERR = 'Twitch chat message failed.';
  const result = await guardHelix(
    ctx,
    '[admin/twitch/chat] helix send error',
    ERR,
    async () => {
      const upstream = await helixFetch(token.accessToken, '/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          broadcaster_id: token.broadcasterId,
          sender_id: token.broadcasterId,
          message,
        }),
      });
      const json = await readJson<{ data?: unknown[] }>(upstream);
      if (!upstream.ok) {
        ctx.logger.error(
          '[admin/twitch/chat] helix send non-OK',
          upstream.status
        );
        throw helixError(ERR);
      }
      return json?.data?.[0] ?? null;
    }
  );

  return {
    result: { result },
    audit: {
      entity_type: 'twitch_chat',
      entity_id: null,
      payload: { action: 'send_twitch_chat', length: message.length },
    },
  };
}

/** POST /twitch/clip — clip des ~30 dernières secondes. */
export async function createClip(
  ctx: ServiceContext
): Promise<Audited<{ id: string | null; edit_url: string | null }>> {
  const token = await requireBroadcasterToken(ctx, 'admin/twitch/clip');
  requireScope(token, CLIP_SCOPE);

  const ERR = 'Twitch clip creation failed.';
  const clip = await guardHelix(
    ctx,
    '[admin/twitch/clip] helix create error',
    ERR,
    async () => {
      const upstream = await helixFetch(
        token.accessToken,
        `/clips?broadcaster_id=${enc(token.broadcasterId)}`,
        { method: 'POST' }
      );
      const json = await readJson<{
        data?: { id?: string; edit_url?: string }[];
      }>(upstream);
      if (!upstream.ok) {
        ctx.logger.error(
          '[admin/twitch/clip] helix create non-OK',
          upstream.status
        );
        throw helixError(ERR);
      }
      return json?.data?.[0] ?? null;
    }
  );

  const id = clip?.id ?? null;
  return {
    result: { id, edit_url: clip?.edit_url ?? null },
    audit: {
      entity_type: 'twitch_clip',
      entity_id: id,
      payload: { action: 'create_twitch_clip' },
    },
  };
}

/** POST /twitch/marker — repère sur le live en cours (409 NOT_LIVE sinon). */
export async function createMarker(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<{ marker: { id?: string } | null }>> {
  const { description } = parsePayload(MarkerSchema, rawBody);
  const token = await requireBroadcasterToken(ctx, 'admin/twitch/marker');
  requireScope(token, BROADCAST_SCOPE);

  // Corps Helix : typé depuis le schéma parsé (pas d'input brut).
  const helixBody: Record<string, unknown> = { user_id: token.broadcasterId };
  if (description !== undefined) helixBody.description = description;

  const ERR = 'Twitch stream marker failed.';
  const marker = await guardHelix(
    ctx,
    '[admin/twitch/marker] helix create error',
    ERR,
    async () => {
      const upstream = await helixFetch(token.accessToken, '/streams/markers', {
        method: 'POST',
        body: JSON.stringify(helixBody),
      });
      // 404 = pas de stream en cours à marquer → conflit d'état.
      if (upstream.status === 404) {
        throw fail(
          409,
          "La chaîne n'est pas en live : aucun marker à poser.",
          'NOT_LIVE'
        );
      }
      const json = await readJson<{ data?: { id?: string }[] }>(upstream);
      if (!upstream.ok) {
        ctx.logger.error(
          '[admin/twitch/marker] helix create non-OK',
          upstream.status
        );
        throw helixError(ERR);
      }
      return json?.data?.[0] ?? null;
    }
  );

  return {
    result: { marker },
    audit: {
      entity_type: 'twitch_marker',
      entity_id: marker?.id ?? null,
      payload: { action: 'create_twitch_marker' },
    },
  };
}

/** POST /twitch/moderation/ban — ban (permanent) ou timeout d'un login. */
export async function banUser(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<{ result: unknown }>> {
  const { login, duration, reason } = parsePayload(BanSchema, rawBody);
  const where = 'admin/twitch/moderation/ban';
  const token = await requireBroadcasterToken(ctx, where);
  requireScope(token, BAN_SCOPE);

  // Résolution login → user_id.
  const LOOKUP_ERR = 'Twitch user lookup failed.';
  const targetUserId = await guardHelix(
    ctx,
    `[${where}] helix users error`,
    LOOKUP_ERR,
    async () => {
      const lookup = await helixFetch(
        token.accessToken,
        `/users?login=${enc(login)}`,
        { method: 'GET' }
      );
      if (!lookup.ok) {
        ctx.logger.error(`[${where}] helix users non-OK`, lookup.status);
        throw helixError(LOOKUP_ERR);
      }
      const json = await readJson<{ data?: { id?: string }[] }>(lookup);
      const found = json?.data?.[0]?.id;
      if (!found) {
        throw fail(
          400,
          `Utilisateur Twitch introuvable : ${login}.`,
          'USER_NOT_FOUND'
        );
      }
      return found;
    }
  );

  const banData: Record<string, unknown> = { user_id: targetUserId };
  if (typeof duration === 'number') banData.duration = duration;
  if (reason) banData.reason = reason;

  const ERR = 'Twitch ban failed.';
  const result = await guardHelix(
    ctx,
    `[${where}] helix ban error`,
    ERR,
    async () => {
      const upstream = await helixFetch(
        token.accessToken,
        `/moderation/bans?broadcaster_id=${enc(
          token.broadcasterId
        )}&moderator_id=${enc(token.broadcasterId)}`,
        { method: 'POST', body: JSON.stringify({ data: banData }) }
      );
      const json = await readJson<{ data?: unknown[] }>(upstream);
      if (!upstream.ok) {
        ctx.logger.error(`[${where}] helix ban non-OK`, upstream.status);
        throw helixError(ERR);
      }
      return json?.data?.[0] ?? null;
    }
  );

  return {
    result: { result },
    audit: {
      entity_type: 'twitch_moderation',
      entity_id: targetUserId,
      payload: {
        action: 'twitch_ban',
        login,
        permanent: typeof duration !== 'number',
        duration: duration ?? null,
        hasReason: !!reason,
      },
    },
  };
}

/** POST /twitch/moderation/clear — vide le chat. */
export async function clearChat(
  ctx: ServiceContext
): Promise<Audited<{ cleared: true }>> {
  const where = 'admin/twitch/moderation/clear';
  const token = await requireBroadcasterToken(ctx, where);
  requireScope(token, CLEAR_SCOPE);

  const ERR = 'Twitch chat clear failed.';
  await guardHelix(ctx, `[${where}] helix clear error`, ERR, async () => {
    const upstream = await helixFetch(
      token.accessToken,
      `/moderation/chat?broadcaster_id=${enc(
        token.broadcasterId
      )}&moderator_id=${enc(token.broadcasterId)}`,
      { method: 'DELETE' }
    );
    if (!upstream.ok) {
      ctx.logger.error(`[${where}] helix clear non-OK`, upstream.status);
      throw helixError(ERR);
    }
  });

  return {
    result: { cleared: true },
    audit: {
      entity_type: 'twitch_moderation',
      entity_id: null,
      payload: { action: 'twitch_clear_chat' },
    },
  };
}

/** PATCH /twitch/moderation/chat-settings — modes du chat. */
export async function updateChatSettings(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<{ settings: unknown }>> {
  const settings = parsePayload(ChatSettingsSchema, rawBody);
  const where = 'admin/twitch/moderation/chat-settings';
  const token = await requireBroadcasterToken(ctx, where);
  requireScope(token, CHAT_SETTINGS_SCOPE);

  const ERR = 'Twitch chat settings update failed.';
  const result = await guardHelix(
    ctx,
    `[${where}] helix patch error`,
    ERR,
    async () => {
      const upstream = await helixFetch(
        token.accessToken,
        `/chat/settings?broadcaster_id=${enc(
          token.broadcasterId
        )}&moderator_id=${enc(token.broadcasterId)}`,
        { method: 'PATCH', body: JSON.stringify(settings) }
      );
      const json = await readJson<{ data?: unknown[] }>(upstream);
      if (!upstream.ok) {
        ctx.logger.error(`[${where}] helix patch non-OK`, upstream.status);
        throw helixError(ERR);
      }
      return json?.data?.[0] ?? null;
    }
  );

  return {
    result: { settings: result },
    audit: {
      entity_type: 'twitch_moderation',
      entity_id: null,
      payload: {
        action: 'twitch_chat_settings',
        keys: Object.keys(settings),
      },
    },
  };
}
