// GET/PATCH /api/player/update-profile — profil de la joueuse (lot P9).
//
// PATCH : nom affiché, BattleTag, SR, poste, chaîne Twitch, avatar dans les
// métadonnées du compte, propagés aux fiches de roster du tenant.
// GET : la chaîne Twitch EFFECTIVE (celle que publie la fiche) et son origine.
//
// `subject: 'self'` : route « soi seulement » (garde utilisateur historique) ; un
// `?as=<autre>` est refusé (403 `subject_unsupported`). Seaux de rate-limit
// distincts lecture / écriture : charger la page ne consomme pas le quota
// d'enregistrement.

import type { NextApiResponse } from 'next';
import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { UpdatePlayerProfileBody } from '../schemas';
import { readTwitchSource, updateProfile } from '../service';

/** Régénère la fiche publique sans attendre l'ISR. Best-effort. */
async function revalidatePublicProfile(
  res: NextApiResponse,
  userId: string,
  log: { error: (...a: unknown[]) => void }
): Promise<void> {
  // `res.revalidate` n'existe pas partout (doubles de réponse en test).
  if (typeof res.revalidate !== 'function') return;
  const path = `/player/${encodeURIComponent(userId)}`;
  try {
    await res.revalidate(path);
  } catch (err) {
    log.error(`[player/update-profile] revalidate ${path} failed`, err);
  }
}

export default defineSubjectRoute({
  key: 'player-update-profile',
  GET: readSubject({
    rateLimit: { max: 30, windowMs: 60_000 },
    cache: false,
    handler: ({ ctx }) => readTwitchSource(ctx, ctx.user),
  }),
  PATCH: mutateSubject({
    body: UpdatePlayerProfileBody,
    rateLimit: { max: 10, windowMs: 60_000 },
    cache: false,
    handler: async ({ ctx, body, res }) => {
      const { response, revalidate } = await updateProfile(ctx, ctx.user, body);
      if (revalidate)
        await revalidatePublicProfile(res, ctx.user.id, ctx.logger);
      return response;
    },
  }),
});
