// features/admin/adherents/client.ts — adhérents de l'association (liste,
// fiche, création, synchro HelloAsso) — L10.
//
// La liste paginée reste sur `useAdminList` (URL ci-dessous, clé
// `['admin','adherents',…]`).

import { adminRequest } from '@/utils/admin/adminHttp';
import { siteSettingsClient } from '@/features/admin/site-settings/client';

const BASE = '/api/admin/adherents';
const byId = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export const adherentsPaths = { list: BASE, byId } as const;

/** Fiche adhérent telle que renvoyée par GET /adherents/[id]. */
export type AdherentRecord = {
  id: string;
  member_number: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  join_date: string;
  current_year: number;
  payment_status: string;
  payment_amount: number;
  payment_date: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  is_active: boolean;
  role: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type HelloAssoSyncResult = {
  created: number;
  updated: number;
  skipped: number;
};

export const adherentsClient = {
  get: (id: string) => adminRequest<AdherentRecord>(byId(id)),
  create: (body: Record<string, unknown>) =>
    adminRequest(BASE, { method: 'POST', json: body, idempotent: true }),
  update: (id: string, body: Record<string, unknown>) =>
    adminRequest(byId(id), { method: 'PATCH', json: body, idempotent: true }),
  remove: (id: string) =>
    adminRequest(byId(id), { method: 'DELETE', idempotent: true }),
  syncHelloAsso: (formSlug: string) =>
    adminRequest<HelloAssoSyncResult>(
      `/api/admin/helloasso/sync?formSlug=${encodeURIComponent(formSlug)}`,
      { method: 'POST', idempotent: true }
    ),
  /** Montant de la cotisation (réglage `cotisation_amount`), 0 si absent. */
  cotisationAmount: async () => {
    const settings = await siteSettingsClient.list();
    const row = settings.items?.find((s) => s.key === 'cotisation_amount');
    return row?.value ? parseFloat(row.value) || 0 : 0;
  },
};
