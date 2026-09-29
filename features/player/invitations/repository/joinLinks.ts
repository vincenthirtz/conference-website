// features/player/invitations/repository/joinLinks.ts — liens d'équipe
// partageables (`team_invite_links`) côté VISITEUR (lot P11). Retrouvés par
// empreinte de jeton ; l'entrée se réserve par UPDATE conditionnel.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TeamInviteLinkRow } from '@/utils/teams/inviteLinks';

const TABLE = 'team_invite_links';

export type JoinLinkRow = TeamInviteLinkRow & { created_by: string | null };

/** Compteur d'entrées, normalisé (cf. la même précaution dans inviteLinks.ts). */
export function usedCount(link: Pick<JoinLinkRow, 'uses_count'>): number {
  return Number(link.uses_count ?? 0) || 0;
}

export async function readJoinLinkByHash(db: AdminDb, tokenHash: string) {
  const { data, error } = await db
    .from(TABLE)
    .select(
      'id, team_id, tenant_id, role, expires_at, max_uses, uses_count, revoked_at, created_by'
    )
    .eq('token_hash', tokenHash)
    .maybeSingle();
  return { link: data as unknown as JoinLinkRow | null, error };
}

export type JoinLinkTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  slug: string | null;
  captain_id: string | null;
};

export async function readJoinLinkTeam(
  db: AdminDb,
  link: Pick<JoinLinkRow, 'team_id' | 'tenant_id'>,
  columns: string
) {
  const { data } = await db
    .from('teams')
    .select(columns)
    .eq('id', link.team_id)
    .eq('tenant_id', link.tenant_id)
    .maybeSingle();
  return data as unknown as JoinLinkTeam | null;
}

export async function isTeamMember(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  userId: string
): Promise<boolean> {
  const { data } = await db
    .from('team_members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Réserve une entrée. UPDATE conditionné par le compteur LU : c'est lui, et
 * non une lecture préalable, qui rend un lien à usage unique réellement
 * unique quand deux personnes cliquent en même temps.
 */
export async function claimJoinLinkSeat(db: AdminDb, link: JoinLinkRow) {
  const current = usedCount(link);
  const { data, error } = await db
    .from(TABLE)
    .update({
      uses_count: current + 1,
      last_used_at: new Date().toISOString(),
    } as never)
    .eq('id', link.id)
    .eq('uses_count', current)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  return { claimed: Boolean(data), error };
}

/** Rend l'entrée réservée quand l'inscription échoue après coup. */
export async function releaseJoinLinkSeat(db: AdminDb, link: JoinLinkRow) {
  const current = usedCount(link);
  const { error } = await db
    .from(TABLE)
    .update({ uses_count: current } as never)
    .eq('id', link.id)
    .eq('uses_count', current + 1);
  return { error };
}
