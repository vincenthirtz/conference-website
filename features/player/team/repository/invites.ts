// features/player/team/repository/invites.ts — invitations sortantes
// (`demandes` type `invite`) et lien d'équipe (`team_invite_links`), côté
// gestion (lot P10). Toujours scopé tenant + équipe. Le jeton n'est JAMAIS
// relu : seule son empreinte est stockée.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TeamInviteLinkRow } from '@/utils/teams/inviteLinks';

/** Annule une invitation EN ATTENTE (CAS : une acceptation concurrente gagne). */
export async function cancelPendingInvitation(
  db: AdminDb,
  tenantId: string,
  invitationId: string
) {
  const { error } = await db
    .from('demandes')
    .update({ status: 'cancelled', processed_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', invitationId)
    .eq('status', 'pending');
  return { error };
}

const LINK_COLUMNS =
  'id, team_id, tenant_id, role, expires_at, max_uses, uses_count, revoked_at, last_used_at, created_at';

export type ManagedInviteLinkRow = TeamInviteLinkRow & {
  created_at: string;
  last_used_at: string | null;
};

/** Lien actif (non révoqué) de l'équipe. */
export async function readActiveInviteLink(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('team_invite_links')
    .select(LINK_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .is('revoked_at', null)
    .maybeSingle();
  return { link: (data as ManagedInviteLinkRow | null) ?? null, error };
}

/** Révoque le lien actif (un seul à la fois : index unique partiel). */
export async function revokeActiveInviteLinks(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { error } = await db
    .from('team_invite_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .is('revoked_at', null);
  return { error };
}

export async function insertInviteLink(
  db: AdminDb,
  row: {
    tenant_id: string;
    team_id: string;
    token_hash: string;
    role: string;
    created_by: string;
    expires_at: string;
    max_uses: number | null;
    uses_count: number;
  }
) {
  const { data, error } = await db
    .from('team_invite_links')
    .insert(row as never)
    .select(LINK_COLUMNS)
    .single();
  return { link: (data as ManagedInviteLinkRow | null) ?? null, error };
}
