// lib/apiContracts/queries.ts
//
// Paramètres de requête des routes admin et espace joueuse validés par zod,
// enregistrés sous `<espace>.<route>.query` (cf. `x-zod-query` dans
// utils/openapi/assemble.ts). Les routes bot ont les leurs dans bot/index.ts.

import type { ApiContractEntry } from './index';
import { querySchema as q0_admin_tcg_overview } from './admin/tcg/overview.query';
import { querySchema as q1_admin_teams_export } from './admin/teams/export.query';
import { GetQuerySchema as q2_admin_twitch_channel_points_redemptions } from './admin/twitch/channel-points/redemptions.query';
import { querySchema as q3_admin_moderation_blacklist_alerts } from './admin/moderation/blacklist/alerts.query';
import { searchQuerySchema as q4_player_discovery_search } from './player/discovery/search.query';
import { querySchema as q5_player_discovery_profile } from './player/discovery/profile.query';
import { querySchema as q6_player_discovery_head_to_head } from './player/discovery/head-to-head.query';
import { listQuerySchema as q7_player_follows_index } from './player/follows/index.query';

export const QUERY_CONTRACT_SCHEMAS: Record<string, ApiContractEntry> = {
  'admin.tcg/overview.query': { schema: q0_admin_tcg_overview, io: 'input' },
  'admin.teams/export.query': { schema: q1_admin_teams_export, io: 'input' },
  'admin.twitch/channel-points/redemptions.query': {
    schema: q2_admin_twitch_channel_points_redemptions,
    io: 'input',
  },
  'admin.moderation/blacklist/alerts.query': {
    schema: q3_admin_moderation_blacklist_alerts,
    io: 'input',
  },
  'player.discovery/search.query': {
    schema: q4_player_discovery_search,
    io: 'input',
  },
  'player.discovery/profile.query': {
    schema: q5_player_discovery_profile,
    io: 'input',
  },
  'player.discovery/head-to-head.query': {
    schema: q6_player_discovery_head_to_head,
    io: 'input',
  },
  'player.follows/index.query': {
    schema: q7_player_follows_index,
    io: 'input',
  },
};
