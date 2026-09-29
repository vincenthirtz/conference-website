// GET/PATCH /api/player/messages/{conversationId} — une conversation entre
// deux équipes, et le marquage « lu » des messages entrants (lot P15).
//
// `subject: 'self'` DÉCLARÉ (avant : garde utilisateur, qui IGNORAIT `?as=`).
// L'inspection staff s'arrête à la liste des conversations ; le fil ne suit
// pas `?as=` → 403.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { markConversationRead, readConversation } from '../service';

const RATE = { max: 40, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'player-messages-conv',
  GET: readSubject({
    subject: 'self',
    rateLimit: RATE,
    handler: ({ ctx, req }) =>
      readConversation(
        { ...ctx, userId: ctx.subject.userId },
        req.query.conversationId,
        readRequestedTeamId(req)
      ),
  }),
  PATCH: mutateSubject({
    subject: 'self',
    rateLimit: RATE,
    handler: ({ ctx, req }) =>
      markConversationRead(
        { ...ctx, userId: ctx.subject.userId },
        req.query.conversationId,
        readRequestedTeamId(req)
      ),
  }),
});
