// DELETE /api/player/delete-account — droit à l'oubli RGPD (lot P9).
//
// `subject: 'self'` strict : on ne supprime que SON compte. Ce que
// « supprimer » veut dire table par table est le registre
// `utils/player/personalDataTables.ts` (cf. service). Idempotence par défaut :
// un double envoi avec la même `Idempotency-Key` rejoue la réponse.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { revalidatePlayerCard } from '@/utils/tcg/revalidatePlayerCard';
import { deleteAccount, notifyAccountDeleted } from '../service';

export default defineSubjectRoute({
  key: 'player-delete-account',
  DELETE: mutateSubject({
    rateLimit: { max: 3, windowMs: 60_000 },
    cache: false,
    handler: async ({ ctx, res }) => {
      const result = await deleteAccount(ctx, ctx.user);
      // Fiche publique en ISR : sans régénération, nom et photo resteraient
      // servis jusqu'à cinq minutes. Best-effort, ne lève pas.
      await revalidatePlayerCard(res, ctx.user.id);
      notifyAccountDeleted(ctx, ctx.user);
      return result;
    },
  }),
});
