// utils/taskBoardSchemas.ts
//
// Schémas zod partagés par les handlers Kanban (admin ET bot). Centralisés
// pour que la validation de bord (priorité, labels, positions, IDs) reste
// identique des deux côtés — pas de dérive de contrat.

import { z } from 'zod';
import { TASK_PRIORITIES } from './taskBoard';

const uuid = z.string().uuid();

/** Priorité — enum aligné sur le CHECK Postgres. */
export const prioritySchema = z.enum(TASK_PRIORITIES);

/**
 * Labels : tableau de chaînes non vides, trimmées, plafonné. On borne pour
 * éviter qu'un payload démesuré ne gonfle la row `text[]`.
 */
export const labelsSchema = z.array(z.string().trim().min(1).max(40)).max(20);

/** Titre de carte : requis, non vide, borné. */
export const titleSchema = z.string().trim().min(1).max(200);

/** Corps commun de création de carte (admin + bot). */
export const createTaskBodySchema = z.object({
  boardId: uuid,
  columnId: uuid,
  title: titleSchema,
  description: z.string().trim().max(5000).optional(),
  priority: prioritySchema.optional(),
  assigneeStaffId: uuid.nullish(),
  // Date ISO (YYYY-MM-DD) — colonne `date`. On accepte aussi null pour effacer.
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  labels: labelsSchema.optional(),
});
export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;

/** Édition de carte (PATCH) — pas de move/assign ici. */
export const patchTaskBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    priority: prioritySchema.optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    labels: labelsSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Aucun champ à modifier',
  });
export type PatchTaskBody = z.infer<typeof patchTaskBodySchema>;

/**
 * Query de la corbeille (`GET /api/admin/tasks/deleted`). `boardId` filtre
 * optionnel ; `limit` borné (défaut appliqué côté handler). Les valeurs
 * arrivent en string dans `req.query` — `z.coerce.number()` gère `limit`.
 */
export const deletedTasksQuerySchema = z.object({
  boardId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type DeletedTasksQuery = z.infer<typeof deletedTasksQuerySchema>;

/**
 * Query du snapshot « live » d'un board (bot — `GET /api/bot/v1/tasks/board-snapshot`).
 * `boardId` requis : la vue live du bot rafraîchit un board précis. Validé en
 * bord de route via `withBotRoute({ querySchema })` → 400 INVALID_QUERY si absent
 * ou non-uuid.
 */
export const boardSnapshotQuerySchema = z.object({
  boardId: uuid,
});
export type BoardSnapshotQuery = z.infer<typeof boardSnapshotQuerySchema>;

/** Déplacement de carte. */
export const moveTaskBodySchema = z.object({
  columnId: uuid,
  position: z.number().int().min(0).optional(),
});
export type MoveTaskBody = z.infer<typeof moveTaskBodySchema>;

/** Création de board. */
export const createBoardBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
});
export type CreateBoardBody = z.infer<typeof createBoardBodySchema>;

/** Édition de board. */
export const patchBoardBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    position: z.number().int().optional(),
    is_archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Aucun champ à modifier',
  });
export type PatchBoardBody = z.infer<typeof patchBoardBodySchema>;

/* ---------------------------------------------------------------------------
 * Extras de carte : commentaires + checklist (create_task_card_extras_tables.sql)
 * ------------------------------------------------------------------------- */

/** Corps de création d'un commentaire de carte. */
export const createCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type CreateCommentBody = z.infer<typeof createCommentBodySchema>;

/** Corps de création d'un item de checklist. */
export const createChecklistItemBodySchema = z.object({
  label: z.string().trim().min(1).max(500),
});
export type CreateChecklistItemBody = z.infer<
  typeof createChecklistItemBodySchema
>;

/** Édition d'un item de checklist (label / coché / position). */
export const patchChecklistItemBodySchema = z
  .object({
    label: z.string().trim().min(1).max(500).optional(),
    isDone: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Aucun champ à modifier',
  });
export type PatchChecklistItemBody = z.infer<
  typeof patchChecklistItemBodySchema
>;

/** Création de colonne. */
export const createColumnBodySchema = z.object({
  boardId: uuid,
  name: z.string().trim().min(1).max(80),
  wipLimit: z.number().int().min(1).max(999).nullish(),
  isDone: z.boolean().optional(),
});
export type CreateColumnBody = z.infer<typeof createColumnBodySchema>;

/** Édition de colonne (reorder inclus). */
export const patchColumnBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    wipLimit: z.number().int().min(1).max(999).nullable().optional(),
    isDone: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Aucun champ à modifier',
  });
export type PatchColumnBody = z.infer<typeof patchColumnBodySchema>;

/* ---------------------------------------------------------------------------
 * Labels colorés (task_labels — create_task_labels_table.sql)
 * ------------------------------------------------------------------------- */

/**
 * Couleur hex '#rrggbb' — aligné sur le CHECK Postgres task_labels_color_chk.
 * On borne au format 6-hex (pas de shorthand #rgb, pas d'alpha) pour rester
 * strictement compatible avec la contrainte DB.
 */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, {
    message: 'Couleur invalide (format attendu #rrggbb)',
  });

/**
 * Nom de label : borné à 40 comme les entrées de `labelsSchema` (les cartes
 * stockent ces noms bruts dans `tasks.labels text[]`, la longueur doit matcher).
 */
export const labelNameSchema = z.string().trim().min(1).max(40);

/** Création d'une définition de label colorée pour un board. */
export const createLabelBodySchema = z.object({
  boardId: uuid,
  name: labelNameSchema,
  color: hexColorSchema,
});
export type CreateLabelBody = z.infer<typeof createLabelBodySchema>;

/** Édition d'une définition de label (nom / couleur / position). */
export const patchLabelBodySchema = z
  .object({
    name: labelNameSchema.optional(),
    color: hexColorSchema.optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Aucun champ à modifier',
  });
export type PatchLabelBody = z.infer<typeof patchLabelBodySchema>;
