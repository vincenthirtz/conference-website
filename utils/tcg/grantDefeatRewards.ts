// utils/tcg/grantDefeatRewards.ts
//
// Récompense TCG d'une défaite : des pièces pour chaque joueuse du camp perdant
// d'un match de tournoi (2026-10-12, « chaque défaite rapporte 100 pièces,
// trois défaites donnent un booster »).
//
// LA JUMELLE DE `grantVictoryRewards`, ET ELLE EN HÉRITE TOUS LES CONTRATS.
// Appelée au même endroit (fin de `applyMatchRatingIncremental`, une fois le
// match noté) et au même moment que la victoire :
//   - ne lève JAMAIS (une récompense ratée n'empêche ni le score ni le rating) ;
//   - peut être rejouée (reprise, correction de score, cron relancé) ;
//   - l'idempotence est dans le SCHÉMA, pas ici : `tcg_wallet_entries` porte
//     UNIQUE (tenant_id, user_id, source_kind, source_ref), et l'écriture est
//     un `upsert(..., { ignoreDuplicates: true })` avec `source_ref` = l'id du
//     match, exactement comme `match_win`. Un rejeu ne crée rien.
//   - les remplaçantes sont payées : elles figurent dans `match_participants`,
//     comme pour la victoire ;
//   - le solde est RECALCULÉ depuis le registre, jamais incrémenté.
//
// QUI N'EST PAS PAYÉ, ET POURQUOI (`isDefeatRewardable`).
//   - UN SCRIM. La victoire de scrim est clée sur le SCRIM, parce que son match
//     miroir se retire et se recrée (boucle de gains du 2026-09-15). Une défaite
//     de scrim aurait exigé la même clé et un barème propre ; la demande vise
//     les matchs de tournoi, on ne l'étend pas en douce.
//   - UN FORFAIT (`status = 'walkover'` ou `forfeit_team_id` posé). La victoire,
//     elle, est payée sur forfait — le camp présent n'y est pour rien. Mais
//     payer le camp qui ne s'est pas présenté récompenserait l'absence : « une
//     défaite » veut dire un match joué et perdu.
//   - UNE JOUEUSE DÉJÀ PAYÉE EN VICTOIRE SUR CE MATCH. C'est le cas d'un score
//     corrigé : le camp qui avait d'abord reçu la victoire la GARDE (aucune
//     reprise, même posture que `reconcileCorrectedMatch`) ; lui verser en plus
//     la défaite le paierait deux fois pour la même rencontre. Ce filtre est une
//     règle d'économie, pas l'idempotence (qui reste la contrainte UNIQUE) ; une
//     lecture impossible fait donc ne RIEN payer, plutôt que de payer à
//     l'aveugle.
//
// PAS DE PAQUET, DONC PAS D'ANNONCE. `announcePackGranted` annonce des paquets ;
// une défaite n'en donne pas, et l'afficher à l'antenne n'a pas de sens.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { MATCH_LOSS_COINS } from './economy';
import { getEarnSource } from './earnSources';
import { recomputeWalletBalance } from './walletRpc';

/** Origine écrite dans `tcg_wallet_entries.source_kind`. */
export const MATCH_LOSS_SOURCE_KIND = 'match_loss';

export type DefeatParticipant = {
  teamId: string;
  userId: string;
};

/** Ce qu'il faut savoir d'un match pour décider s'il paie une défaite. */
export type DefeatMatchFacts = {
  scrim_id?: string | null;
  status: string;
  is_bye?: boolean | null;
  forfeit_team_id?: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

/**
 * Le camp perdant d'un match qui paie une défaite, ou `null` s'il n'en paie
 * pas (scrim, forfait, bye, match non terminé, vainqueur absent ou étranger
 * aux deux camps). Pur. Cf. l'en-tête pour chaque exclusion.
 */
export function defeatRewardLoserTeam(match: DefeatMatchFacts): string | null {
  if (match.scrim_id) return null;
  if (match.is_bye) return null;
  if (match.status !== 'finished') return null;
  if (match.forfeit_team_id) return null;
  const { team1_id: t1, team2_id: t2, winner_team_id: w } = match;
  if (!t1 || !t2 || !w) return null;
  if (w === t1) return t2;
  if (w === t2) return t1;
  return null;
}

export async function grantDefeatRewards(input: {
  tenantId: string;
  matchId: string;
  loserTeamId: string;
  participants: readonly DefeatParticipant[];
}): Promise<void> {
  const { tenantId, matchId, loserTeamId, participants } = input;
  if (!supabaseAdmin) return;
  // Le drapeau COMMANDE (cf. earnSources.ts) : voie éteinte, rien n'est tenté.
  if (!getEarnSource(MATCH_LOSS_SOURCE_KIND)?.schemaReady) return;

  try {
    const losers = [
      ...new Set(
        participants
          .filter((p) => p.teamId === loserTeamId && p.userId)
          .map((p) => p.userId)
      ),
    ];
    if (losers.length === 0) return;

    // Les joueuses déjà payées en VICTOIRE sur ce match (score corrigé) : elles
    // gardent la victoire, on ne leur verse pas la défaite en plus.
    const { data: winRows, error: winErr } = await supabaseAdmin
      .from('tcg_wallet_entries')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'match_win')
      .eq('source_ref', matchId)
      .in('user_id', losers);
    if (winErr) {
      logger.error(
        '[tcg] défaite du match %s non créditée (registre illisible): %s',
        matchId,
        winErr.message
      );
      return;
    }
    const alreadyWon = new Set(
      ((winRows ?? []) as Array<{ user_id?: string }>)
        .map((r) => r.user_id)
        .filter((id): id is string => typeof id === 'string')
    );
    const recipients = losers.filter((userId) => !alreadyWon.has(userId));
    if (recipients.length === 0) return;

    const nowIso = new Date().toISOString();
    const { error } = await supabaseAdmin.from('tcg_wallet_entries').upsert(
      recipients.map((userId) => ({
        tenant_id: tenantId,
        user_id: userId,
        amount: MATCH_LOSS_COINS,
        source_kind: MATCH_LOSS_SOURCE_KIND,
        source_ref: matchId,
        created_at: nowIso,
      })),
      {
        onConflict: 'tenant_id,user_id,source_kind,source_ref',
        ignoreDuplicates: true,
      }
    );
    if (error) {
      // 23514 tant que `tcg_match_loss_reward.sql` n'est pas appliquée.
      logger.error(
        '[tcg] pièces de défaite non créditées (match %s): %s',
        matchId,
        error.message
      );
      return;
    }

    await Promise.all(
      recipients.map((userId) => recomputeWalletBalance(tenantId, userId))
    );
  } catch (err) {
    // Un hook d'effet de bord ne casse pas son hôte. Cf. l'en-tête.
    logger.error(
      '[tcg] récompense de défaite impossible (match %s): %s',
      matchId,
      err instanceof Error ? err.message : String(err)
    );
  }
}
