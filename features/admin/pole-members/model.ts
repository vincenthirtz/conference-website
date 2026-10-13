// features/admin/pole-members/model.ts — formes de réponse de la fiche membre
// de pôle, lues par le client du site. Types seuls (le service les porte en
// signature) : le site les reçoit sans tirer service ni repository.

import type { Database } from '@/types/database.generated';

export type PoleMemberRow =
  Database['public']['Tables']['association_pole_members']['Row'];

/** `PATCH /api/admin/pole-members/[id]` : la ligne relue, et les champs touchés. */
export type PoleMemberUpdateResult = {
  row: PoleMemberRow | null;
  fields: string[];
};
