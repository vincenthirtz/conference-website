// features/player/scrims/service/directoryNetwork.ts — les équipes des
// AUTRES espaces volontaires qui cherchent un scrim (lot 4 : réseau entre
// espaces). On ne voit que si l'on donne (utils/tenants/networkSharing.ts).
//
// Ne jette jamais : une panne de lecture rend une liste vide — l'annuaire de
// mon espace doit s'afficher même si le réseau tousse.

import { resolveTeamSkillRating } from '@/utils/overwatchRank';
import { isSearchLive, overlappingSlots } from '@/utils/teams/scrimSearch';
import {
  readNetworkTenantIds,
  readTenantLabels,
} from '@/utils/tenants/networkSharing';
import {
  listNetworkSearches,
  listNetworkTeams,
  type RosterSkill,
} from '../repository/directory';
import type { NetworkDirectoryTeam } from '../schemas';
import type { ScrimsCtx } from './context';

export async function loadNetworkTeams(
  ctx: ScrimsCtx,
  mySlots: unknown[]
): Promise<NetworkDirectoryTeam[]> {
  const { tenantId } = ctx;
  const networkIds = (await readNetworkTenantIds(tenantId, 'scrims')).filter(
    (id) => id !== tenantId
  );
  if (networkIds.length === 0) return [];

  const { rows: searchRows, error: searchErr } = await listNetworkSearches(
    ctx.db,
    networkIds
  );
  if (searchErr) {
    ctx.logger.error('[teams-directory] network searches error', searchErr);
    return [];
  }
  const searches = searchRows.filter((row) => isSearchLive(row as never));
  if (searches.length === 0) return [];

  const { rows: teamRows, error: teamsErr } = await listNetworkTeams(
    ctx.db,
    searches.map((s) => s.team_id)
  );
  if (teamsErr) {
    ctx.logger.error('[teams-directory] network teams error', teamsErr);
    return [];
  }

  const labels = await readTenantLabels(networkIds);
  const byTeam = new Map(searches.map((s) => [s.team_id, s]));

  const out: NetworkDirectoryTeam[] = [];
  for (const row of teamRows) {
    if (row.is_active === false || row.deleted_at) continue;
    const search = byTeam.get(row.id as string);
    if (!search) continue;
    const label = labels.get(row.tenant_id as string);
    out.push({
      id: row.id as string,
      name: (row.name as string) ?? '',
      short_name: (row.short_name as string | null) ?? null,
      logo_url: (row.logo_url as string | null) ?? null,
      country: (row.country as string | null) ?? null,
      discord: (row.discord as string | null) ?? null,
      skill_average: resolveTeamSkillRating(
        row.skill_rating as number | null | undefined,
        (row.team_members as RosterSkill[]) ?? []
      ),
      scrim_search: {
        slots: search.slots || [],
        format: search.format,
        note: search.note,
        expires_at: search.expires_at,
        common_slots: overlappingSlots(
          mySlots as never[],
          (search.slots || []) as never[]
        ),
      },
      tenant: { name: label?.name ?? '', slug: label?.slug ?? null },
    });
  }

  // Les créneaux en commun d'abord : c'est ce qui rend une équipe lointaine
  // réellement jouable cette semaine.
  out.sort((a, b) => {
    const d =
      b.scrim_search.common_slots.length - a.scrim_search.common_slots.length;
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  return out;
}
