// utils/tcg/grantVictoryRewards.ts
//
// Récompenses TCG d'une victoire : un paquet et des pièces pour chaque joueuse
// du camp gagnant.
//
// DEUX CONTRATS, HÉRITÉS DE L'HÔTE. Cette fonction est appelée depuis
// `applyMatchRatingIncremental`, un hook d'effet de bord qui :
//   - ne doit JAMAIS lever (une récompense ratée ne doit pas empêcher un score
//     d'être appliqué ni un rating d'être calculé) ;
//   - peut être rejoué (reprise, correction de score, cron relancé).
// D'où le try/catch global et le fait qu'aucune erreur ne remonte.
//
// L'IDEMPOTENCE N'EST PAS ASSURÉE ICI, ELLE EST DANS LE SCHÉMA.
//   `tcg_packs` porte UNIQUE (tenant_id, user_id, source_match_id) et
//   `tcg_wallet_entries` UNIQUE (tenant_id, user_id, source_kind, source_ref).
//   On écrit donc en `upsert(..., { ignoreDuplicates: true })` : un rejeu ne
//   crée rien et n'échoue pas. Se reposer sur une vérification applicative
//   « ai-je déjà donné ? » laisserait une fenêtre entre la lecture et
//   l'écriture — c'est exactement ce qui a produit quatre doublons Discord le
//   2026-09-12.
//
// LES REMPLAÇANTES SONT RÉCOMPENSÉES. Elles figurent dans
// `match_participants`, et le moteur de rating les traite comme les autres.
// Inventer ici une seconde définition de « avoir joué » ferait diverger deux
// systèmes qui décrivent la même rencontre.
//
// LE SOLDE EST RECALCULÉ, PAS INCRÉMENTÉ. `tcg_wallets.balance` est un cache du
// registre : on le réécrit depuis la somme des écritures plutôt que de lui
// ajouter un delta. Un incrément perdu creuse un écart définitif ; un recalcul
// se répare tout seul au passage suivant.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { coinsForWin } from './economy';

export type VictoryParticipant = {
  teamId: string;
  userId: string;
};

export async function grantVictoryRewards(input: {
  tenantId: string;
  matchId: string;
  winnerTeamId: string;
  /** Match miroir d'un scrim : la récompense suit la pondération du rating. */
  isScrim: boolean;
  participants: readonly VictoryParticipant[];
}): Promise<void> {
  const { tenantId, matchId, winnerTeamId, isScrim, participants } = input;
  if (!supabaseAdmin) return;

  try {
    // Camp gagnant, dédoublonné : une joueuse inscrite deux fois sur la feuille
    // ne toucherait qu'un paquet de toute façon (contrainte d'unicité), mais
    // autant ne pas lui envoyer deux écritures.
    const winners = [
      ...new Set(
        participants
          .filter((p) => p.teamId === winnerTeamId && p.userId)
          .map((p) => p.userId)
      ),
    ];
    if (winners.length === 0) return;

    const nowIso = new Date().toISOString();

    // 1) Un paquet par gagnante.
    const { error: packError } = await supabaseAdmin.from('tcg_packs').upsert(
      winners.map((userId) => ({
        tenant_id: tenantId,
        user_id: userId,
        source_match_id: matchId,
        granted_at: nowIso,
      })),
      {
        onConflict: 'tenant_id,user_id,source_match_id',
        ignoreDuplicates: true,
      }
    );
    if (packError) {
      logger.error('[tcg] paquets non attribués: %s', packError.message);
    }

    // 2) Les pièces. `source_ref` = l'identifiant du match : c'est lui qui
    //    rend l'écriture unique pour cette joueuse et cette source.
    const amount = coinsForWin(isScrim);
    const sourceKind = isScrim ? 'scrim_win' : 'match_win';

    const { error: coinError } = await supabaseAdmin
      .from('tcg_wallet_entries')
      .upsert(
        winners.map((userId) => ({
          tenant_id: tenantId,
          user_id: userId,
          amount,
          source_kind: sourceKind,
          source_ref: matchId,
          created_at: nowIso,
        })),
        {
          onConflict: 'tenant_id,user_id,source_kind,source_ref',
          ignoreDuplicates: true,
        }
      );
    if (coinError) {
      logger.error('[tcg] pièces non créditées: %s', coinError.message);
      // Le solde ci-dessous reste juste : il se recalcule depuis le registre,
      // qui n'a simplement pas bougé.
    }

    // 3) Rafraîchir le solde de chaque gagnante depuis le registre.
    await Promise.all(
      winners.map((userId) => refreshBalance(tenantId, userId))
    );
  } catch (err) {
    // Un hook d'effet de bord ne casse pas son hôte. Cf. l'en-tête.
    logger.error(
      '[tcg] attribution des récompenses impossible (match %s): %s',
      matchId,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Réécrit `tcg_wallets.balance` avec la somme du registre.
 *
 * Exporté parce que l'achat de booster en a besoin lui aussi : un seul endroit
 * sait comment un solde se dérive de ses écritures.
 */
export async function refreshBalance(
  tenantId: string,
  userId: string
): Promise<void> {
  if (!supabaseAdmin) return;

  const { data, error } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .select('amount')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);

  if (error) {
    logger.error('[tcg] solde illisible (%s): %s', userId, error.message);
    return;
  }

  const balance = ((data ?? []) as Array<{ amount: number }>).reduce(
    (sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0),
    0
  );

  const { error: writeError } = await supabaseAdmin.from('tcg_wallets').upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      // Le CHECK interdit un solde négatif : une somme négative signalerait un
      // registre incohérent, on la plafonne à zéro plutôt que de faire échouer
      // l'écriture et de laisser le cache figé sur une valeur encore plus
      // fausse.
      balance: Math.max(0, balance),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,user_id' }
  );

  if (writeError) {
    logger.error('[tcg] solde non écrit (%s): %s', userId, writeError.message);
  }
}
