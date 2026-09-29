// features/player/tcg/service/welcomeGift.ts — « M'a-t-on offert un cadeau
// de bienvenue, et lequel ? » (lot P14, extrait de
// pages/api/player/tcg/welcome-gift.ts, même contrat).
//
// LE SUJET, JAMAIS L'APPELANT : le tableau de bord est partagé avec la vue
// d'inspection admin (`?as=`) — lire `user.id` afficherait le cadeau de
// l'ADMIN chez la joueuse inspectée.
//
// L'ABSENCE DE CADEAU EST UN ÉTAT NORMAL (`gift: null`). UNE ERREUR DE
// LECTURE N'EST PAS UNE ABSENCE : 500, jamais « tu n'as rien reçu ».
//
// La réclamation passe par `grantSelfWelcome` (clé unique au registre) : un
// cadeau ne se crédite qu'une fois, quel que soit le nombre d'appels.

import { grantSelfWelcome } from '@/utils/tcg/grantSelfWelcome';
import * as repo from '../repository/core';
import type {
  PlayerWelcomeClaimResponse,
  PlayerWelcomeGiftResponse,
} from '../schemas';
import { refuse } from './errors';
import type { TcgServiceContext } from './context';

export async function readWelcomeGift(
  ctx: TcgServiceContext
): Promise<PlayerWelcomeGiftResponse> {
  const { entry, error } = await repo.readLatestWelcomeEntry(ctx.db, ctx);
  if (error) {
    ctx.logger.error('[tcg/welcome] lecture impossible: %s', error.message);
    throw refuse(500, 'Lecture impossible.');
  }
  // Une seule raison d'interroger l'éligibilité : la carte de réclamation.
  const probe = entry
    ? null
    : await grantSelfWelcome({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        dryRun: true,
      });
  return {
    gift: entry ? { coins: entry.amount, receivedAt: entry.created_at } : null,
    welcomeClaimable: probe?.status === 'claimable',
  };
}

export async function claimWelcomeGift(
  ctx: TcgServiceContext
): Promise<PlayerWelcomeClaimResponse> {
  const outcome = await grantSelfWelcome({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  if (outcome.status === 'error') {
    throw refuse(500, 'Réclamation impossible.');
  }
  if (outcome.status === 'granted') {
    // `packGranted` est RENDU : si le paquet a échoué, l'écran doit le dire.
    return {
      status: 'granted',
      coins: outcome.coins,
      packGranted: outcome.packGranted,
    };
  }
  // Un refus ordinaire, pas une panne : 200 avec un motif lisible.
  return {
    status: outcome.status === 'claimable' ? 'already' : outcome.status,
  };
}
