// GET/PUT /api/player/push/prefs — préférences par canal (push opt-out,
// e-mail opt-in, annonces opt-out RGPD) (lot P15).
//
// `subject: 'self'` DÉCLARÉ : les préférences sont un CONSENTEMENT personnel,
// jamais lu ni posé par le staff — `?as=` → 403 (l'écran les masque déjà en
// inspection).

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readPrefs, setPref } from '../service';

const RATE = { max: 60, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'player-push-prefs',
  GET: readSubject({
    subject: 'self',
    rateLimit: RATE,
    cache: 'no-store',
    handler: ({ ctx }) => readPrefs({ ...ctx, userId: ctx.subject.userId }),
  }),
  PUT: mutateSubject({
    subject: 'self',
    rateLimit: RATE,
    cache: 'no-store',
    // Corps validé par le service : codes historiques `INVALID_BODY` /
    // `INVALID_EVENT_TYPE`.
    handler: ({ ctx, req }) =>
      setPref({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
