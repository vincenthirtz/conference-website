// POST /api/player/matches/{matchId}/evidence — la capitaine joint une
// capture d'écran à son match (preuve du score, cf. service/evidence.ts).
//
// Sujet `self` : c'est la personne connectée qui dépose pour son équipe — le
// staff joint ses preuves par l'admin. Plafond de débit plus serré que le
// report (un upload coûte du stockage) ; idempotence par `Idempotency-Key`
// (un double tap ne dépose pas deux fois).

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { EvidenceUploadBody } from '../schemas';
import { attachScreenshot } from '../service/evidence';

export default defineSubjectRoute({
  key: 'player-match-evidence',
  POST: mutateSubject({
    rateLimit: { max: 10, windowMs: 60_000 },
    body: EvidenceUploadBody,
    status: 201,
    handler: ({ ctx, req, body }) =>
      attachScreenshot({ ...ctx, userId: ctx.subject.userId }, req.query, body),
  }),
});
