// POST /api/teams/toggle-scrim-open — le capitaine (ou un rôle portant
// `manage_scrims`) déclare son équipe ouverte / fermée aux scrims (opt-in
// public affiché sur /scrim). Miroir de toggleJoinable.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { ToggleScrimOpenBody } from '../schemas';
import { toggleScrimOpen } from '../service';

export default defineSubjectRoute({
  key: 'toggle-scrim-open',
  tenantResolution: 'async',
  POST: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: { permission: 'manage_scrims' },
    body: ToggleScrimOpenBody,
    rateLimit: { max: 10, windowMs: 60_000 },
    handler: ({ body, ctx }) => toggleScrimOpen(ctx, body),
  }),
});
