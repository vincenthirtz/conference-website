// features/player/tcg/service/booster.ts — acheter un booster avec ses pièces
// (lot P14, extrait de pages/api/player/tcg/booster.ts, même contrat).
//
// LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS : aucun moyen de paiement ici, et
// ce n'est pas un oubli (monnaie achetable + contenu aléatoire = loot box,
// interdite BE/NL, surveillée par l'ANJ).
//
// L'ACHAT NE CRÉE QU'UN PAQUET FERMÉ ; le tirage appartient à l'ouverture.
//
// TOUT SE JOUE EN BASE, EN UNE TRANSACTION : `tcg_purchase_booster` (verrou
// du porte-monnaie, solde relu sur le REGISTRE, paquet, écriture, cache —
// tout ou rien). Ce service ne fait que traduire son issue.

import { BOOSTER_PRICE_COINS } from '@/utils/tcg/economy';
import { purchaseBoosterAtomic } from '@/utils/tcg/walletRpc';
import { refuse } from './errors';

export async function buyBooster(ctx: { tenantId: string; userId: string }) {
  const outcome = await purchaseBoosterAtomic({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    price: BOOSTER_PRICE_COINS,
  });

  switch (outcome.kind) {
    case 'ok':
      return { packId: outcome.packId, price: BOOSTER_PRICE_COINS };
    case 'insufficient_funds':
      // Le solde rendu est celui du REGISTRE, relu sous verrou.
      throw refuse(400, 'Pièces insuffisantes.', 'insufficient_funds', {
        balance: outcome.balance,
        price: BOOSTER_PRICE_COINS,
      });
    case 'contended':
      throw refuse(409, 'Le solde a changé, réessaie.', 'balance_changed');
    case 'unavailable':
      throw refuse(
        503,
        'Achat momentanément indisponible.',
        'purchase_unavailable'
      );
    default:
      // Résultat INCONNU : tout ou rien a été écrit. Rien à rembourser — la
      // collection dira si le paquet est arrivé.
      throw refuse(500, 'Achat impossible.');
  }
}
