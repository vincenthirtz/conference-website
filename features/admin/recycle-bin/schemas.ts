// features/admin/recycle-bin/schemas.ts — corbeille (éléments soft-deleted).
//
// zod seul, imports RELATIFS : lu par l'assemblage OpenAPI (Node sans `@/`).

import { z } from 'zod';
import {
  looseBody,
  looseQuery,
  uuidPathParam,
} from '../../../utils/admin/pathParams';

export const DELETED_TYPES = [
  'stage',
  'team',
  'match',
  'partner',
  'cast_member',
  'adherent',
  'staff',
  'scrim',
  'scrim_planning',
  'task',
  'news',
] as const;

export type DeletedType = (typeof DELETED_TYPES)[number];

/**
 * Sources GLOBALES (sans `tenant_id`) : réservées au pôle-admin et à l'owner
 * GLOBAL. Un staff d'espace n'en voit ni n'en restaure rien.
 */
export const PLATFORM_DELETED_TYPES: readonly DeletedType[] = [
  'partner',
  'adherent',
  'staff',
];

/**
 * Durée de séjour en corbeille avant purge définitive automatique
 * (/api/cron/recycle-bin-purge). 90 jours : assez pour qu'une suppression
 * erronée soit remarquée (une saison de tournoi), assez court pour ne pas
 * garder indéfiniment les données personnelles d'un adhérent supprimé.
 */
export const PURGE_RETENTION_DAYS = 90;

/**
 * Types qu'on peut effacer DÉFINITIVEMENT (cron et bouton owner). Les autres
 * restent en corbeille tant que personne ne les restaure :
 *
 *   - `team`, `match`, `stage`, `scrim` : historique compétitif. Leur
 *     suppression physique emporte en CASCADE matchs, manches, résultats,
 *     classements finaux, lineups, votes MVP… — l'histoire des tournois.
 *   - `staff` : la ligne porte l'auteur de `staff_logs` (journal d'audit) et
 *     est liée au compte auth ; l'effacement d'un compte staff passe par la
 *     gestion des utilisateurs (suppression du compte), pas par la corbeille.
 *   - `cast_member` : `cast_assignments` (historique de qui a casté quel
 *     match) le référence par une FK non versionnée, au comportement inconnu.
 *   - `announcements` : table sans aucun écran ni route (ni suppression, ni
 *     lecture) — rien à mettre en corbeille.
 *
 * `adherent` est purgeable mais ANONYMISÉ, pas effacé, s'il a des cotisations
 * (`adherent_payments`, ON DELETE CASCADE) : les pièces comptables restent.
 */
export const PURGEABLE_TYPES: readonly DeletedType[] = [
  'scrim_planning',
  'task',
  'news',
  'partner',
  'adherent',
];

/**
 * Suffixe d'e-mail d'un adhérent ANONYMISÉ par la purge (`purged-<id>` +
 * suffixe : `adherents.email` est NOT NULL UNIQUE). Domaine `.invalid`
 * réservé (RFC 2606) : aucun envoi ne peut partir. Un adhérent anonymisé
 * sort de la corbeille et n'est plus ni restaurable ni repurgé.
 */
export const ANONYMIZED_ADHERENT_EMAIL_SUFFIX = '@purged.invalid';

/** GET /api/admin/recycle-bin — `type` vérifié par le service (400 `Unknown type`). */
export const RecycleBinQuery = looseQuery(['type', 'limit', 'offset']);

/** PATCH /api/admin/recycle-bin — `{ id, type }` à restaurer. */
export const RecycleBinRestoreDoc = looseBody(['id', 'type']);

/**
 * DELETE /api/admin/recycle-bin?id=&type= — purge définitive (owner). Strict :
 * une route qui efface pour de bon n'accepte ni id ni type approximatifs. Un
 * type connu mais non purgeable est refusé plus loin (409 `NOT_PURGEABLE`).
 */
export const RecycleBinPurgeQuery = z.object({
  id: uuidPathParam('A valid id is required.'),
  type: z.enum(DELETED_TYPES, { error: 'Unknown type.' }),
});
