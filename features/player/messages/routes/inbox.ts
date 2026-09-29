// GET/POST /api/player/messages — boîte de réception de l'équipe gérée et
// envoi d'un message à une autre équipe (lot P15).
//
// GET `subject: 'follow'` (inchangé) : le staff inspecte la boîte d'une
// capitaine via `?as=` (journal `view_captain_data`). POST `subject: 'self'` :
// un `?as=` en écriture reste refusé en 403 (code `subject_unsupported` au
// lieu de `subject_read_only`) — l'expéditrice est toujours l'appelante.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { listConversations, sendMessage } from '../service';

const RATE = { max: 40, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'player-messages',
  inspectionAudit: 'view_captain_data',
  GET: readSubject({
    subject: 'follow',
    rateLimit: RATE,
    handler: ({ ctx, req }) =>
      listConversations(
        { ...ctx, userId: ctx.subject.userId },
        readRequestedTeamId(req)
      ),
  }),
  POST: mutateSubject({
    subject: 'self',
    rateLimit: RATE,
    status: 201,
    // Corps validé par le service (schéma partagé) APRÈS le contrôle de
    // l'équipe : ordre historique des refus.
    handler: ({ ctx, req }) =>
      sendMessage(
        { ...ctx, userId: ctx.subject.userId },
        ctx.user,
        readRequestedTeamId(req),
        req.body
      ),
  }),
});
