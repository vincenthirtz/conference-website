// features/admin/scrims/routes/result.ts — POST /api/admin/scrims/[scrimId]/result
// Le staff saisit (ou corrige) le score final d'un scrim, ou le score en cours
// (`final: false`). Règles et effets de bord : service/scrimResult.ts.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ScrimIdUuidQuery, ScrimResultLooseBody } from '../schemas';
import { recordScrimResult } from '../service/scrimResult';

export default defineAdminRoute({
  key: 'scrim-result',
  guard: { permission: 'manage_teams' },
  POST: mutate({
    query: ScrimIdUuidQuery,
    // Corps lu par le service : un échec rend le code historique INVALID_BODY.
    body: ScrimResultLooseBody,
    audit: 'record_scrim_result',
    handler: ({ query, body, ctx }) =>
      audited(ctx, recordScrimResult(ctx, query.scrimId, body)),
  }),
});
