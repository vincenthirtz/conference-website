// features/admin/twitch/routes/predictions.ts — /api/admin/twitch/predictions
//   GET  : la prediction la plus récente (ou null).
//   POST : crée une prediction (201 ; scope channel:manage:predictions).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CreatePredictionDoc } from '../schemas';
import { createPrediction, getLatestPrediction } from '../service/predictions';
import { PER_MIN_30, PER_MIN_60, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-predictions',
  guard: TWITCH_GUARD,
  GET: read({
    rateLimit: PER_MIN_60,
    handler: ({ ctx }) => getLatestPrediction(ctx),
  }),
  POST: mutate({
    body: CreatePredictionDoc,
    rateLimit: PER_MIN_30,
    status: 201,
    audit: 'create_twitch_prediction',
    handler: ({ ctx, req }) => audited(ctx, createPrediction(ctx, req.body)),
  }),
});
