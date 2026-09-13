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
// DÉPENSE CONCURRENTE : ÉCRITURE CONDITIONNELLE, PAS LECTURE PUIS ÉCRITURE.
//   Deux achats lancés en même temps liraient le même solde et le
//   dépenseraient deux fois. La contrainte d'unicité du registre ne protège
//   pas de ce cas — chaque achat a sa propre référence. On écrit donc le
//   nouveau solde en exigeant que l'ancien n'ait pas bougé
//   (`.eq('balance', avant)`) : si un autre achat est passé entre-temps, zéro
//   ligne ne correspond et on refuse plutôt que de livrer à crédit.
//
//   Le solde n'étant qu'un CACHE du registre, une incohérence résiduelle se
//   corrige d'elle-même au prochain `refreshBalance`.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { BOOSTER_PRICE_COINS, canAfford } from '@/utils/tcg/economy';
import { refreshBalance } from '@/utils/tcg/grantVictoryRewards';
import { logger } from '@/utils/logger';

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
  const userId = user.id;

  // 1) Le solde courant. Pas de ligne = solde nul : c'est un état normal pour
  //    quelqu'un qui n'a encore rien gagné, pas une erreur.
  const { data: walletRow, error: walletError } = await supabaseAdmin
    .from('tcg_wallets')
    .select('balance')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (walletError) {
    logger.error('[tcg/booster] solde illisible: %s', walletError.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const balance = (walletRow as { balance?: number } | null)?.balance ?? 0;

  if (!canAfford(balance, BOOSTER_PRICE_COINS)) {
    return res.status(400).json({
      error: 'Pièces insuffisantes.',
      code: 'insufficient_funds',
      balance,
      price: BOOSTER_PRICE_COINS,
    });
  }

  // 2) Débit CONDITIONNEL : n'aboutit que si le solde n'a pas bougé depuis la
  //    lecture. `select()` pour savoir si une ligne a réellement été touchée.
  const { data: debited, error: debitError } = await supabaseAdmin
    .from('tcg_wallets')
    .update({
      balance: balance - BOOSTER_PRICE_COINS,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('balance', balance)
    .select('balance');

  if (debitError) {
    logger.error('[tcg/booster] débit impossible: %s', debitError.message);
    return res.status(500).json({ error: 'Achat impossible.' });
  }
  if (!debited || debited.length === 0) {
    // Le solde a changé entre la lecture et l'écriture : un autre achat est
    // passé. On refuse plutôt que de livrer à crédit ; réessayer est sûr.
    return res.status(409).json({
      error: 'Le solde a changé, réessaie.',
      code: 'balance_changed',
    });
  }

  // 3) Le paquet acheté. `source_match_id` NULL + `source_kind = 'purchase'` :
  //    la contrainte de cohérence du schéma exige exactement cela.
  const { data: pack, error: packError } = await supabaseAdmin
    .from('tcg_packs')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      source_kind: 'purchase',
      source_match_id: null,
    })
    .select('id')
    .maybeSingle();

  if (packError || !pack) {
    // Le débit a eu lieu mais le paquet n'existe pas : on rend les pièces en
    // recalculant le solde depuis le REGISTRE, qui n'a pas été débité (aucune
    // écriture n'y a encore été portée). Le cache redevient donc juste.
    logger.error(
      '[tcg/booster] paquet non créé après débit, solde restauré: %s',
      packError?.message ?? 'aucune ligne'
    );
    await refreshBalance(tenantId, userId);
    return res.status(500).json({ error: 'Achat impossible.' });
  }

  const packId = (pack as { id: string }).id;

  // 4) L'écriture au registre, APRÈS le paquet : `source_ref` est son
  //    identifiant, et le registre ne doit mentionner que des paquets qui
  //    existent.
  const { error: entryError } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      amount: -BOOSTER_PRICE_COINS,
      source_kind: 'booster_purchase',
      source_ref: packId,
    });

  if (entryError) {
    // UNE ERREUR N'EST PAS UNE ABSENCE D'ÉCRITURE. Un 504 PostgREST survenant
    // APRÈS le commit rend une erreur alors que la ligne existe (~1,7 % en
    // septembre sur ce projet). Supprimer le paquet dans ce cas débite la
    // joueuse de 300 pièces ET ne lui livre rien : c'est le MIROIR exact du
    // cas que ce bloc croit protéger, et la perte est définitive puisque le
    // paquet disparaît.
    //
    // On relit donc par la clé UNIQUE avant d'annuler. Cette relecture est
    // sûre là où une relecture AVANT écriture ne l'aurait pas été : la
    // contrainte a déjà tranché, on ne fait que constater son verdict.
    const { data: committed, error: recheckError } = await supabaseAdmin
      .from('tcg_wallet_entries')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('source_kind', 'booster_purchase')
      .eq('source_ref', packId)
      .maybeSingle();

    if (committed) {
      // Le débit est bien là : l'erreur portait sur l'accusé de réception, pas
      // sur l'écriture. L'achat a donc RÉUSSI — on ne supprime rien.
      logger.warn(
        '[tcg/booster] débit committé malgré une erreur (%s) — achat confirmé',
        entryError.message
      );
      await refreshBalance(tenantId, userId);
      return res.status(200).json({ packId });
    }

    if (recheckError) {
      // Indéterminé. On NE supprime PAS : un paquet livré sans débit se
      // rattrape (la contrainte d'unicité rend un rejeu inoffensif), une
      // joueuse débitée sans paquet ne se rattrape pas.
      logger.error(
        '[tcg/booster] état indéterminé pour le paquet %s — CONSERVÉ: %s',
        packId,
        recheckError.message
      );
      await refreshBalance(tenantId, userId);
      return res.status(500).json({ error: 'Achat impossible.' });
    }

    // ON ANNULE L'ACHAT. Sans le paquet, l'étape 5 recalculerait le solde
    // depuis un registre NON débité et rendrait les pièces — la joueuse
    // garderait donc un booster gratuit à chaque erreur transitoire. On
    // supprime le paquet : ni pièces prélevées, ni paquet livré, l'état
    // revient exactement là où il était.
    logger.error(
      '[tcg/booster] écriture registre échouée, achat annulé: %s',
      entryError.message
    );
    const { error: rollbackError } = await supabaseAdmin
      .from('tcg_packs')
      .delete()
      .eq('id', packId)
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);
    if (rollbackError) {
      // Paquet orphelin : offert, mais jamais facturé. On le dit fort, c'est
      // le seul cas où l'état reste incohérent.
      logger.error(
        '[tcg/booster] paquet %s NON supprimé après annulation: %s',
        packId,
        rollbackError.message
      );
    }
    await refreshBalance(tenantId, userId);
    return res.status(500).json({ error: 'Achat impossible.' });
  }

  // 5) Le cache se réaligne sur le registre — seule source de vérité.
  await refreshBalance(tenantId, userId);

  return res.status(200).json({ packId, price: BOOSTER_PRICE_COINS });
});
