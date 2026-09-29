// features/admin/custom-game-presets/routes/byId.ts —
// /api/admin/custom-game-presets/[presetId] : PATCH (périmètre non
// modifiable), DELETE. 404 hors tenant actif.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { PresetIdQuery, PresetPatchDoc } from '../schemas';
import { deletePreset, updatePreset } from '../service';

const LIMIT = { max: 30, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'custom-game-presets-item',
  guard: { permission: 'manage_tournaments' },
  PATCH: mutate({
    query: PresetIdQuery,
    body: PresetPatchDoc,
    rateLimit: LIMIT,
    audit: 'update_custom_game_preset',
    handler: ({ query, body, ctx }) =>
      audited(ctx, updatePreset(ctx, query.presetId, body)),
  }),
  DELETE: mutate({
    query: PresetIdQuery,
    rateLimit: LIMIT,
    audit: 'delete_custom_game_preset',
    handler: ({ query, ctx }) =>
      audited(ctx, deletePreset(ctx, query.presetId)),
  }),
});
