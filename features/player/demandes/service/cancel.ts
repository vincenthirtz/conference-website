// features/player/demandes/service/cancel.ts — la joueuse annule sa propre
// demande en attente. Déplacé de pages/api/demandes/cancel (lot P11).
//
// La lecture ne sert qu'à répondre 404 / 403 explicitement ; la décision
// « encore en attente ? » appartient au CAS de `cancelPendingDemande` (pas de
// fenêtre TOCTOU entre lecture et écriture).

import { LegacyAdminError } from '@/utils/admin/errors';
import { cancelPendingDemande, readDemandeOwner } from '../repository/demandes';
import type { CancelDemandeInput } from '../schemas';
import type { DemandesCtx } from './context';

export async function cancelMyDemande(
  ctx: DemandesCtx,
  { demandeId }: CancelDemandeInput
) {
  const { demande, error: fetchErr } = await readDemandeOwner(
    ctx.db,
    ctx.tenantId,
    demandeId
  );
  if (fetchErr || !demande) {
    throw new LegacyAdminError(404, 'Demande introuvable.');
  }
  if (demande.user_id !== ctx.userId) {
    throw new LegacyAdminError(403, "Cette demande ne t'appartient pas.");
  }

  const { updated, error: updateErr } = await cancelPendingDemande(
    ctx.db,
    ctx.tenantId,
    demandeId
  );
  if (updateErr) {
    ctx.logger.error('[demandes/cancel] update error:', updateErr);
    throw new LegacyAdminError(500, "Échec de l'annulation.");
  }
  if (updated.length === 0) {
    throw new LegacyAdminError(409, 'Cette demande a déjà été traitée.');
  }

  return { success: true, info: 'Demande annulée.' };
}
