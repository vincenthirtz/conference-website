// features/admin/twitch/routes/predictionById.ts — PATCH /api/admin/twitch/predictions/[id]
// Verrouille, résout (winning_outcome_id requis) ou annule une prediction.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { PatchPredictionDoc, TwitchIdQuery } from '../schemas';
import { updatePrediction } from '../service/predictions';
import { PER_MIN_30, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-prediction-by-id',
  guard: TWITCH_GUARD,
  PATCH: mutate({
    query: TwitchIdQuery,
    body: PatchPredictionDoc,
    rateLimit: PER_MIN_30,
    audit: 'update_twitch_prediction',
    handler: ({ ctx, req }) =>
      audited(ctx, updatePrediction(ctx, req.query.id, req.body)),
  }),
});
