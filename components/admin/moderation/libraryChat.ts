// components/admin/moderation/libraryChat.ts — règles PURES de la modération
// du chat de la Women's Library (onglet « Library » de /admin/moderation,
// lot 6 de docs/PLAN-womens-library.md).
//
// La sourdine se valide avec le schéma du contrat (`LibraryChatAdminMuteBody`,
// copie synchronisée depuis conference-api) : le formulaire refuse exactement
// ce que la route refuserait, sans recopier ses bornes.

import {
  LIBRARY_CHAT_ADMIN_MUTE_REASON_MAX,
  LibraryChatAdminMuteBody,
  type LibraryChatAdminMuteInput,
} from '@/features/admin/library/chatSchemas';

export { LIBRARY_CHAT_ADMIN_MUTE_REASON_MAX };

/** Durées proposées, en minutes (30 jours au plus : au-delà, bannir). */
export type ChatMutePreset = '1h' | '24h' | '7d' | '30d';
export const CHAT_MUTE_PRESETS: readonly ChatMutePreset[] = [
  '1h',
  '24h',
  '7d',
  '30d',
];
export const CHAT_MUTE_PRESET_MINUTES: Record<ChatMutePreset, number> = {
  '1h': 60,
  '24h': 24 * 60,
  '7d': 7 * 24 * 60,
  '30d': 30 * 24 * 60,
};

/** Dans la salle du message, ou partout. */
export type ChatMuteScope = 'room' | 'library';

export type ChatMuteFormValues = {
  userId: string;
  roomId: string;
  scope: ChatMuteScope;
  preset: ChatMutePreset;
  reason: string;
};

export type ChatMuteFormResult =
  | { ok: true; body: LibraryChatAdminMuteInput }
  | { ok: false; error: 'required' | 'tooLong' };

/** Corps du POST, validé par le schéma du contrat ; le seul champ libre est le motif. */
export function buildChatMuteBody(
  values: ChatMuteFormValues
): ChatMuteFormResult {
  const parsed = LibraryChatAdminMuteBody.safeParse({
    userId: values.userId,
    roomId: values.scope === 'room' ? values.roomId : null,
    minutes: CHAT_MUTE_PRESET_MINUTES[values.preset],
    reason: values.reason,
  });
  if (parsed.success) return { ok: true, body: parsed.data };
  return {
    ok: false,
    error: values.reason.trim() ? 'tooLong' : 'required',
  };
}

/** Code métier d'un refus de la route (`player_not_found`, …), s'il y en a un. */
export function chatErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** Les salles vues dans les messages chargés, sans doublon, pour le filtre. */
export function roomsOf<
  T extends {
    roomId: string;
    roomKind: string;
    roomName: string | null;
    roomOwnerNickname: string | null;
  },
>(items: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items)
    if (!seen.has(item.roomId)) seen.set(item.roomId, item);
  return [...seen.values()];
}
