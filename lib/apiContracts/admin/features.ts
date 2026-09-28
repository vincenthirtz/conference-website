// lib/apiContracts/admin/features.ts — schémas des routes admin MIGRÉES sur
// `defineAdminRoute` (docs/PLAN-industrialisation-admin.md, lot L9).
//
// Les schémas vivent dans leur module (`features/admin/<domaine>/schemas.ts`,
// zod seul) : la route les applique, la spec les référence (`x-zod`,
// `x-zod-query`). `tests/unit/adminRouteContracts.test.ts` vérifie que le
// schéma documenté est LE MÊME objet que celui de la route — pas une copie.
//
// Chemins relatifs, comme le reste de lib/apiContracts : l'assembleur tourne
// aussi dans le script de build.

import type { ApiContractEntry } from '../index';
import {
  TwitchChannelBody,
  TwitchChannelIdQuery,
  TwitchChannelListQuery,
  TwitchChannelPatch,
} from '../../../features/admin/diffusion/schemas';
import { RemoveFreePlayerQuery } from '../../../features/admin/free-players/schemas';
import { UserSearchQuery } from '../../../features/admin/users/schemas';
import { AlertsSummaryQuery } from '../../../features/admin/dashboard/schemas';

export const ADMIN_FEATURE_BODY_SCHEMAS: Record<string, ApiContractEntry> = {
  'admin.twitchChannels.create': { schema: TwitchChannelBody, io: 'input' },
  'admin.twitchChannels.update': { schema: TwitchChannelPatch, io: 'input' },
};

export const ADMIN_FEATURE_QUERY_SCHEMAS: Record<string, ApiContractEntry> = {
  'admin.free-players.query': { schema: RemoveFreePlayerQuery, io: 'input' },
  'admin.twitch-channels.query': {
    schema: TwitchChannelListQuery,
    io: 'input',
  },
  'admin.twitch-channels/[id].query': {
    schema: TwitchChannelIdQuery,
    io: 'input',
  },
  'admin.users/search.query': { schema: UserSearchQuery, io: 'input' },
  'admin.alerts-summary.query': { schema: AlertsSummaryQuery, io: 'input' },
};
