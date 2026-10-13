// features/admin/partners/model.ts — formes de réponse des écrans partenaires
// et demandes de partenariat, lues par le client du site. Types seuls (le
// service les porte en signature) : le site les reçoit sans tirer service ni
// repository.

import type { Database } from '@/types/database.generated';

export type PartnerRow = Database['public']['Tables']['partners']['Row'];

/** Ligne de la liste : projection sans `deleted_at` (la liste ne montre que les actifs). */
export type PartnerListItem = Omit<PartnerRow, 'deleted_at'>;

export type PartnerList = {
  items: PartnerListItem[];
  total: number | null;
};

/** `PUT /api/admin/partners/[id]` : la ligne relue, et ce qui a été envoyé. */
export type PartnerUpdateResult = {
  row: PartnerRow;
  updates: Partial<PartnerRow>;
};

/** Ligne de la liste des demandes de partenariat (projection de la table). */
export type PartnershipRequestListItem = {
  budget_range: string | null;
  category: string;
  company_name: string;
  contact_name: string;
  created_at: string | null;
  email: string;
  id: string;
  message: string;
  phone: string | null;
  status: string | null;
};

export type PartnershipRequestList = {
  items: PartnershipRequestListItem[];
  counts: Record<string, number>;
  total: number | null;
};
