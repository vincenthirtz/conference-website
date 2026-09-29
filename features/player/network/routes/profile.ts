// GET /api/player/discovery/profile?userId= — couche sociale de la fiche
// publique (je peux la suivre ? je la suis déjà ?), DERRIÈRE LE LOGIN
// (lot P15). La page /player/[userId] est publique et indexable : rien de
// l'opt-in n'est dans le HTML servi à un robot, tout passe par ici.
// ANTI-ÉNUMÉRATION : tout ce qui n'est pas « découvrable » répond pareil.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readSocialProfile } from '../service';

export default defineSubjectRoute({
  key: 'player-discovery-profile',
  GET: readSubject({
    subject: 'self',
    rateLimit: { max: 60, windowMs: 60_000 },
    cache: 'no-store',
    handler: ({ ctx, req }) =>
      readSocialProfile({ ...ctx, userId: ctx.subject.userId }, req.query),
  }),
});
