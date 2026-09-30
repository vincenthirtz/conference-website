// features/admin/staff-planning/schemas.ts — entrées des routes staff du
// planning (`/api/admin/staff-planning/**`).
//
// zod seul, imports RELATIFS : référencés par la spec OpenAPI
// (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.

import * as z from 'zod';

export const STAFF_PLANNING_ROLES = [
  'cast',
  'moderation',
  'prod_obs',
  'live_prod',
] as const;
export type StaffPlanningRole = (typeof STAFF_PLANNING_ROLES)[number];

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue : AAAA-MM-JJ');
const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure attendue : HH:MM');
const person = z.string().trim().min(1).max(80);

/** GET /api/admin/staff-planning?from=&to= — fenêtre de dates incluse. */
export const StaffPlanningListQuery = z.looseObject({
  from: ymd,
  to: ymd,
});

/** PATCH / DELETE /api/admin/staff-planning/[slotId]. */
export const StaffPlanningSlotIdQuery = z.looseObject({
  slotId: z.string().uuid(),
});

/** POST /api/admin/staff-planning — un créneau saisi à la main. */
export const StaffPlanningSlotCreate = z.object({
  person_name: person,
  slot_date: ymd,
  start_time: hhmm,
  end_time: hhmm,
  role: z.enum(STAFF_PLANNING_ROLES).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
  /**
   * Répétition hebdomadaire : le même créneau, même jour de la semaine,
   * jusqu'à cette date incluse (26 semaines au plus).
   */
  repeat_until: ymd.nullable().optional(),
});

/** PATCH /api/admin/staff-planning/[slotId] — rôle, horaires, note. */
export const StaffPlanningSlotPatch = z
  .object({
    start_time: hhmm.optional(),
    end_time: hhmm.optional(),
    role: z.enum(STAFF_PLANNING_ROLES).nullable().optional(),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Rien à modifier.',
  });

/**
 * POST /api/admin/staff-planning/import — le tableur déjà lu côté navigateur
 * (`utils/staffPlanningCsv`). Les créneaux importés des mois `months`
 * remplacent l'import précédent de ces mois ; les saisies manuelles restent.
 */
export const StaffPlanningImportBody = z.object({
  months: z
    .array(z.string().regex(/^\d{4}-\d{2}$/))
    .min(1)
    .max(24),
  entries: z
    .array(
      z.object({
        person: person,
        date: ymd,
        start: hhmm,
        end: hhmm,
      })
    )
    .max(5000),
});
