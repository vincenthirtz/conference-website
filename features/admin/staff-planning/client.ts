// features/admin/staff-planning/client.ts — planning du staff (disponibilités
// cast, modération, prod OBS, live). Les écritures passent par
// `useIdempotentMutation` : ce module n'en expose que les chemins.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { StaffPlanningRole } from './schemas';

const BASE = '/api/admin/staff-planning';
const enc = encodeURIComponent;

export const staffPlanningPaths = {
  list: BASE,
  byId: (id: string) => `${BASE}/${enc(id)}`,
  import: `${BASE}/import`,
} as const;

export type StaffPlanningSlotRow = {
  id: string;
  person_name: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  role: StaffPlanningRole | null;
  note: string | null;
  source: 'manual' | 'csv';
  created_at: string;
};

export type StaffPlanningPayload = {
  slots: StaffPlanningSlotRow[];
  people: string[];
};

export const staffPlanningClient = {
  list: (from: string, to: string) =>
    adminRequest<StaffPlanningPayload>(
      `${BASE}?from=${enc(from)}&to=${enc(to)}`
    ),
};
