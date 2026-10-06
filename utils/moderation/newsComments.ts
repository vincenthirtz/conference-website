// utils/moderation/newsComments.ts
//
// Modération des commentaires d'actualités — règles partagées par la route
// publique (/api/news/comments) et l'écran staff (/admin/moderation).
//
// Statut (migration news_comments_moderation.sql) :
//   - `visible` : publié (défaut, comportement historique) ;
//   - `pending` : en attente — mode « pré-modération » du tenant ;
//   - `hidden`  : masqué par le staff, réversible (contrairement à la
//     suppression).
// La lecture publique ne rend QUE `visible`.
//
// Le mode est un réglage du tenant (`site_settings`, clé
// `news_comments_moderation`) : `pre` = pré-modération ; absent ou autre
// valeur = publication directe. Le défaut garde le comportement d'avant.

import { getSetting } from '@/utils/siteSettings';

export const COMMENT_STATUSES = ['visible', 'pending', 'hidden'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const COMMENT_MODERATION_SETTING_KEY = 'news_comments_moderation';

export type CommentModerationMode = 'post' | 'pre';

/** Valeur stockée → mode. Toute valeur inconnue retombe sur la publication directe. */
export function parseModerationMode(
  value: string | null | undefined
): CommentModerationMode {
  return value === 'pre' ? 'pre' : 'post';
}

/** Mode de modération du tenant. Ne throw jamais (défaut : `post`). */
export async function getCommentModerationMode(
  tenantId: string
): Promise<CommentModerationMode> {
  try {
    return parseModerationMode(
      await getSetting(COMMENT_MODERATION_SETTING_KEY, tenantId)
    );
  } catch {
    return 'post';
  }
}

/** Statut d'un commentaire qui naît sous ce mode. */
export function initialCommentStatus(
  mode: CommentModerationMode
): CommentStatus {
  return mode === 'pre' ? 'pending' : 'visible';
}

/** Un commentaire est-il lisible publiquement ? (ligne sans statut = visible) */
export function isPubliclyVisible(row: { status?: string | null }): boolean {
  return row.status == null || row.status === 'visible';
}
