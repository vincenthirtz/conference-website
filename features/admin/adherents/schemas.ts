// features/admin/adherents/schemas.ts — adhérents de l'association.
// Zod seul : la route les applique, la spec les référence (lib/apiContracts).

import * as z from 'zod';
import { adminListQuery } from '../../../utils/admin/listQuery';
import {
  looseBody,
  looseQuery,
  uuidPathParam,
} from '../../../utils/admin/pathParams';

export const ADHERENT_PAYMENT_STATUSES = [
  'pending',
  'partial',
  'paid',
  'exempt',
  'overdue',
] as const;
export const ADHERENT_PAYMENT_METHODS = [
  'cash',
  'check',
  'transfer',
  'card',
  'helloasso',
  'other',
] as const;
export const ADHERENT_ROLES = [
  'member',
  'volunteer',
  'board',
  'president',
  'treasurer',
  'secretary',
] as const;

/** Colonnes triables — liste FERMÉE (le serveur refuse les autres). */
export const ADHERENT_SORTABLE = [
  'last_name',
  'first_name',
  'member_number',
  'join_date',
  'current_year',
  'payment_status',
  'payment_amount',
  'payment_date',
  'role',
  'created_at',
] as const;

export const AdherentListQuery = adminListQuery({
  sortable: ADHERENT_SORTABLE,
  pageSize: 50,
  filters: {
    paymentStatus: z.enum(ADHERENT_PAYMENT_STATUSES).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    role: z.enum(ADHERENT_ROLES).optional(),
    active: z.enum(['true', 'false']).optional(),
  },
});
export type AdherentListQuery = z.output<typeof AdherentListQuery>;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `${max} caractères au maximum.` })
    .optional()
    .transform((v) => v || null);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    error: 'Date attendue au format AAAA-MM-JJ.',
  })
  .optional();

export const AdherentCreateBody = z.object({
  firstName: z
    .string({ error: 'Le prénom est obligatoire.' })
    .trim()
    .min(1, { error: 'Le prénom est obligatoire.' })
    .max(100),
  lastName: z
    .string({ error: 'Le nom est obligatoire.' })
    .trim()
    .min(1, { error: 'Le nom est obligatoire.' })
    .max(100),
  email: z
    .string({ error: 'L’email est obligatoire.' })
    .trim()
    .toLowerCase()
    .min(1, { error: 'L’email est obligatoire.' })
    .max(254),
  phone: text(40),
  birthDate: isoDate,
  address: text(200),
  city: text(100),
  postalCode: text(20),
  country: text(100),
  joinDate: isoDate,
  currentYear: z.number().int().min(2000).max(2100).optional(),
  paymentStatus: z.enum(ADHERENT_PAYMENT_STATUSES).optional(),
  paymentAmount: z.number().min(0).optional(),
  paymentDate: isoDate,
  paymentMethod: z.enum(ADHERENT_PAYMENT_METHODS).optional(),
  paymentReference: text(100),
  isActive: z.boolean().optional(),
  role: z.enum(ADHERENT_ROLES).optional(),
  notes: text(2000),
});
export type AdherentCreateBody = z.output<typeof AdherentCreateBody>;

export const ADHERENT_LIST_COLUMNS =
  'id, member_number, first_name, last_name, email, phone, join_date, current_year, payment_status, payment_amount, payment_date, payment_method, is_active, role, created_at';

export type AdherentStats = {
  total: number;
  currentYear: number;
  paid: number;
  pending: number;
  overdue: number;
};

/* ------------------- Fiche adhérent, synchro HelloAsso ------------------- */

/** `/api/admin/adherents/[id]` — message historique de la route. */
export const AdherentIdQuery = z.object({
  id: uuidPathParam('Member ID required.'),
});

/** PATCH `/adherents/[id]` : champs nommés, appliqués tels quels par le service. */
export const AdherentPatchDoc = looseBody([
  'firstName',
  'lastName',
  'email',
  'phone',
  'birthDate',
  'address',
  'city',
  'postalCode',
  'country',
  'joinDate',
  'currentYear',
  'paymentStatus',
  'paymentAmount',
  'paymentDate',
  'paymentMethod',
  'paymentReference',
  'isActive',
  'role',
  'notes',
]);

/** Toutes les colonnes de `adherents` : ce que renvoyait le `select('*')`. */
export const ADHERENT_COLUMNS =
  'id, member_number, auth_user_id, first_name, last_name, email, phone, birth_date, address, city, postal_code, country, join_date, current_year, payment_status, payment_amount, payment_date, payment_method, payment_reference, is_active, role, notes, created_at, created_by, updated_at, updated_by, deleted_at' as const;

/** Toutes les colonnes de `adherent_payments` (ex-`select('*')`). */
export const ADHERENT_PAYMENT_COLUMNS =
  'id, adherent_id, year, amount, payment_date, payment_method, payment_reference, notes, created_at, created_by' as const;

/** GET /api/admin/helloasso/memberships — formulaire auto-détecté si absent. */
export const HelloAssoMembershipsQuery = looseQuery([
  'formSlug',
  'page',
  'pageSize',
]);

/** POST /api/admin/helloasso/sync — formulaire auto-détecté si absent. */
export const HelloAssoSyncQuery = looseQuery(['formSlug']);
