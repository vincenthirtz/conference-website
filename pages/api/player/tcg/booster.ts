// pages/api/player/tcg/booster.ts
//
// Acheter un booster avec ses pièces.
//
// LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS. Cet endpoint ne connaît aucun
// moyen de paiement, et ce n'est pas un oubli : monnaie achetable + contenu
// aléatoire = loot box payante, interdite en Belgique et aux Pays-Bas,
// surveillée par l'ANJ en France, avec un public qui compte des mineures.
//
// L'ACHAT NE CRÉE QU'UN PAQUET FERMÉ. Le tirage des cartes appartient à
// l'ouverture : séparer les deux permet de rejouer une ouverture ratée sans
// re-débiter, et de montrer « tu as N paquets » sans avoir figé leur contenu.
//
// UNE TRANSACTION, PAS TROIS REQUÊTES (correctif du 2026-09-15).
//   L'ancienne version débitait le CACHE (écriture conditionnelle), créait le
//   paquet, puis écrivait au registre : trois transactions PostgREST. Entre la
//   deuxième et la troisième, n'importe quel recalcul du solde (un gain, un
//   recyclage, un autre achat) relisait un registre pas encore débité et
//   ÉCRASAIT le cache — le débit disparaissait, et trois achats rapides en
//   livraient trois pour le prix de deux, le registre passant sous zéro sans
//   bruit. L'écriture conditionnelle ne protégeait que de deux achats lisant la
//   même valeur, pas d'un recalcul intercalé.
//
//   L'achat passe désormais par `tcg_purchase_booster`
//   (`database/migrations/tcg_wallet_atomic_balance.sql`) : verrou de la ligne
//   de porte-monnaie, solde relu par `SUM(amount)` sur le REGISTRE, paquet,
//   écriture au registre, cache — tout ou rien. Plus de remboursement à
//   orchestrer, plus de paquet orphelin à supprimer : un 504 PostgREST après
//   commit laisse un achat COMPLET (paquet + débit), jamais un paquet gratuit.
//
// CONTRAT HTTP INCHANGÉ : 200 `{ packId, price }`, 400 `insufficient_funds`
// (avec `balance` et `price`), 409 `balance_changed` (verrou non obtenu —
// réessayer est sûr), 500 sur panne. Ajout : 503 `purchase_unavailable` tant
// que la migration n'est pas appliquée — on REFUSE plutôt que d'acheter sans
// verrou.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { BOOSTER_PRICE_COINS } from '@/utils/tcg/economy';
import { purchaseBoosterAtomic } from '@/utils/tcg/walletRpc';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'player-tcg-buy')
  ) {
    return;
  }

  const tenantId = resolveTenantIdForUserRequest(req);

  const outcome = await purchaseBoosterAtomic({
    tenantId,
    userId: user.id,
    price: BOOSTER_PRICE_COINS,
  });

  switch (outcome.kind) {
    case 'ok':
      return res
        .status(200)
        .json({ packId: outcome.packId, price: BOOSTER_PRICE_COINS });
    case 'insufficient_funds':
      // Le solde rendu est celui du REGISTRE, relu sous verrou : c'est lui qui
      // a refusé, pas un cache éventuellement en retard.
      return res.status(400).json({
        error: 'Pièces insuffisantes.',
        code: 'insufficient_funds',
        balance: outcome.balance,
        price: BOOSTER_PRICE_COINS,
      });
    case 'contended':
      return res.status(409).json({
        error: 'Le solde a changé, réessaie.',
        code: 'balance_changed',
      });
    case 'unavailable':
      return res.status(503).json({
        error: 'Achat momentanément indisponible.',
        code: 'purchase_unavailable',
      });
    default:
      // Résultat INCONNU : tout ou rien a été écrit. Rien à rembourser ni à
      // supprimer — la collection dira si le paquet est arrivé.
      return res.status(500).json({ error: 'Achat impossible.' });
  }
});
