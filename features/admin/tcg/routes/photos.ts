// features/admin/tcg/routes/photos.ts — /api/admin/tcg/photos
// GET la file des photos en attente, PATCH approuver / refuser la photo
// AFFICHÉE (écriture conditionnelle au chemin). La fiche publique est
// régénérée après la décision (la route porte `res`, pas le service).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { revalidatePlayerCard } from '@/utils/tcg/revalidatePlayerCard';
import { audited } from '../../_shared/audited';
import { TcgPhotoDecisionDoc } from '../schemas';
import { decidePhoto, listPendingPhotos } from '../service/moderation';

export default defineAdminRoute({
  key: 'tcg-photos',
  guard: { permission: 'manage_tcg' },
  GET: read({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx }) => listPendingPhotos(ctx),
  }),
  PATCH: mutate({
    body: TcgPhotoDecisionDoc,
    rateLimit: { max: 30, windowMs: 60_000 },
    // Slug de la méthode ; `tcg_photo_reject` pour un refus.
    audit: 'tcg_photo_approve',
    handler: async ({ body, ctx, res }) => {
      const { status, userId } = await audited(
        ctx,
        decidePhoto(ctx, ctx.staff.staff.id, body)
      );
      await revalidatePlayerCard(res, userId);
      return { status };
    },
  }),
});
