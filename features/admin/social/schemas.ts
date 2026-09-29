// features/admin/social/schemas.ts — entrées des routes staff qui posent les
// identifiants des réseaux sociaux (`/api/admin/{instagram,tiktok}/**`).
//
// Corps « historiques » : champs NOMMÉS pour la spec, contrôlés par le service
// avec les messages d'origine. zod seul, imports RELATIFS (spec OpenAPI).

import { looseBody, looseQuery } from '../../../utils/admin/pathParams';

export const InstagramSecretDoc = looseBody(['appSecret']);
export const TiktokCredentialsDoc = looseBody(['clientKey', 'clientSecret']);

/** PUT /api/admin/bluesky/credentials — handle + mot de passe d'application. */
export const BlueskyCredentialsDoc = looseBody(['handle', 'appPassword']);

/** GET /api/admin/social-posts?limit= — historique (1 à 50, défaut 20). */
export const SocialPostListQuery = looseQuery(['limit']);

/** POST /api/admin/social-posts — validé par le service (400 + `details`). */
export const SocialPostDoc = looseBody([
  'text',
  'imageUrl',
  'targets',
  'dryRun',
]);
