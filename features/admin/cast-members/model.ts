// features/admin/cast-members/model.ts — formes de réponse de la fiche
// casteuse, lues par le client du site. Types seuls (le service les porte en
// signature) : le site les reçoit sans tirer service ni repository.

import type { Database } from '@/types/database.generated';

export type CastMemberRow = Database['public']['Tables']['cast_members']['Row'];

/** `PATCH /api/admin/cast-members/[id]` : la ligne relue, et les champs touchés. */
export type CastMemberUpdateResult = {
  row: CastMemberRow | null;
  fields: string[];
};
