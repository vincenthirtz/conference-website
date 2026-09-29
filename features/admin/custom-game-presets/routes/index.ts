// features/admin/custom-game-presets/routes/index.ts —
// /api/admin/custom-game-presets : GET liste (`?game=`, `?tournament_id=`),
// POST création. Auth `manage_tournaments` sur le tenant actif.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { PresetCreateDoc, PresetListQuery } from '../schemas';
import { createPreset, listPresets } from '../service';

export default defineAdminRoute({
  key: 'custom-game-presets',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: PresetListQuery,
    handler: ({ query, ctx }) => listPresets(ctx, query),
  }),
  POST: mutate({
    body: PresetCreateDoc,
    status: 201,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'create_custom_game_preset',
    handler: ({ body, ctx }) =>
      audited(ctx, createPreset(ctx, ctx.staff.staff.id, body)),
  }),
});
