// GET/DELETE /api/player/twitch-status — lien Twitch (identité OAuth) de la
// personne connectée : état, retrait (lot P9).
//
// `subject: 'self'` : route « soi seulement » ; `?as=<autre>` → 403
// `subject_unsupported`. Le rattachement passe par /api/auth/twitch/start et
// son callback, inchangés (URL de retour JOUEUSE, distincte de celle de la
// chaîne de diffusion).

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readTwitchLink, unlinkTwitch } from '../service';

export default defineSubjectRoute({
  key: 'twitch-status',
  GET: readSubject({
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx }) => readTwitchLink(ctx.user.id),
  }),
  DELETE: mutateSubject({
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx }) => unlinkTwitch(ctx.user.id),
  }),
});
