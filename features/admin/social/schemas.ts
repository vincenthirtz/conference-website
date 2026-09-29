// features/admin/social/schemas.ts — entrées des routes staff qui posent les
// identifiants des réseaux sociaux (`/api/admin/{instagram,tiktok}/**`).
//
// Corps « historiques » : champs NOMMÉS pour la spec, contrôlés par le service
// avec les messages d'origine. zod seul, imports RELATIFS (spec OpenAPI).

import { looseBody } from '../../../utils/admin/pathParams';

export const InstagramSecretDoc = looseBody(['appSecret']);
export const TiktokCredentialsDoc = looseBody(['clientKey', 'clientSecret']);
