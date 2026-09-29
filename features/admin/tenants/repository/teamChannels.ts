// features/admin/tenants/repository/teamChannels.ts — salons Discord
// d'équipe : ce que le site a enregistré (`teams.discord_*`), ce que le bot a
// vu (`team_discord_channels`), le roster. Tout scopé par tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';

/** Toutes les colonnes de `team_discord_channels` (ex-`select('*')`). */
const SNAPSHOT_COLUMNS =
  'team_id, tenant_id, role_id, role_name, role_exists, text_channel_id, text_channel_name, text_channel_exists, voice_channel_id, voice_channel_name, voice_channel_exists, access, warnings, captured_at' as const;

export async function loadTeamChannelState(db: AdminDb, tenantId: string) {
  const [teams, snapshots, members] = await Promise.all([
    db
      .from('teams')
      .select(
        'id, name, slug, is_active, captain_id, discord_role_id, discord_channel_id, discord_voice_channel_id'
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    db
      .from('team_discord_channels')
      .select(SNAPSHOT_COLUMNS)
      .eq('tenant_id', tenantId),
    db
      .from('team_members')
      .select('team_id, user_id, role, battle_tag, display_name')
      .eq('tenant_id', tenantId),
  ]);
  return { teams, snapshots, members };
}

export async function listDiscordLinks(db: AdminDb, authUserIds: string[]) {
  const { data } = await db
    .from('user_discord_links')
    .select('auth_user_id, discord_user_id')
    .in('auth_user_id', authUserIds);
  return data ?? [];
}

export async function listTeamsForDiscordAction(
  db: AdminDb,
  tenantId: string,
  teamId: string | null
) {
  const query = db
    .from('teams')
    .select(
      'id, name, slug, discord_role_id, discord_channel_id, discord_voice_channel_id'
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  const { data, error } = teamId ? await query.eq('id', teamId) : await query;
  return { rows: data ?? [], error };
}
