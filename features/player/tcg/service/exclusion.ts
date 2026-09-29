// features/player/tcg/service/exclusion.ts — « NE PAS FIGURER DANS LE TCG »
// (lot P14, extrait de pages/api/player/tcg/exclusion.ts, même contrat).
//
// CE QUE LE RETRAIT FAIT, DANS CET ORDRE : 1) la PHOTO part la première, par
// le chemin existant (file de purge) — on ABANDONNE si elle échoue ; 2)
// `excluded_at` est posé (sortie du vivier, cartes déjà tirées anonymisées).
// L'ordre inverse la déclarerait retirée avec sa photo encore en ligne.
//
// Il NE supprime PAS les cartes des collections d'autrui : elles restent,
// ANONYMES. RÉVERSIBLE ; revenir ne rend pas la photo (purgée).
//
// Les 3 garde-fous photo (`readCardFaces`) ne sont pas touchés ici.

import { enqueuePhotoPurge } from '@/utils/tcg/photoPurge';
import * as repo from '../repository/core';
import { refuse } from './errors';
import type { TcgServiceContext } from './context';

export async function readExclusion(ctx: TcgServiceContext) {
  const { card, error } = await repo.readPlayerCardConsent(ctx.db, ctx);
  if (error) {
    ctx.logger.error('[tcg/exclusion] lecture impossible: %s', error.message);
    throw refuse(500, 'Lecture impossible.');
  }
  const excludedAt = card?.excluded_at ?? null;
  return { excluded: Boolean(excludedAt), excludedAt };
}

export async function withdrawFromTcg(ctx: TcgServiceContext) {
  const { db, tenantId, userId, logger } = ctx;
  const { card, error: readError } = await repo.readPlayerCardConsent(db, ctx);
  if (readError) {
    logger.error('[tcg/exclusion] lecture photo: %s', readError.message);
    throw refuse(500, 'Retrait impossible.');
  }
  const path = card?.photo_path ?? null;
  if (path) {
    const queued = await enqueuePhotoPurge({
      tenantId,
      userId,
      storagePath: path,
      reason: 'revoked',
    });
    if (!queued) throw refuse(500, 'Retrait impossible.');
  }

  const nowIso = new Date().toISOString();
  const { error } = await repo.markExcluded(db, {
    tenantId,
    userId,
    nowIso,
    hadPhoto: Boolean(path),
  });
  if (error) {
    logger.error('[tcg/exclusion] retrait impossible: %s', error.message);
    throw refuse(500, 'Retrait impossible.');
  }
  return { excluded: true, excludedAt: nowIso };
}

export async function rejoinTcg(ctx: TcgServiceContext) {
  const { error } = await repo.clearExcluded(ctx.db, ctx);
  if (error) {
    ctx.logger.error('[tcg/exclusion] retour impossible: %s', error.message);
    throw refuse(500, 'Opération impossible.');
  }
  return { excluded: false, excludedAt: null };
}
