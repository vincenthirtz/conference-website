// utils/predictions/settle.ts
//
// Régler les pronostics d'un match qui vient de recevoir son résultat, et
// créditer les pronostics justes en pièces TCG.
//
// APPELÉ DEPUIS `applyMatchScore`, juste après le rating. Même contrat que les
// autres effets de bord de ce crochet :
//   - NE LÈVE JAMAIS : un règlement raté ne doit pas empêcher un score d'être
//     appliqué ;
//   - PEUT ÊTRE REJOUÉ (correction de score, reprise).
//
// L'ORDRE : PIÈCES D'ABORD, MARQUAGE ENSUITE. Le crédit passe par
// `grantCoinsThenPacks` (`source_ref = <matchId>`, `ON CONFLICT DO NOTHING`),
// PUIS les pronostics sont marqués réglés. Un échec entre les deux laisse des
// pronostics non marqués que le règlement suivant reprend — et dont le crédit,
// déjà écrit, ne se répète pas. L'ordre inverse perdrait des pièces : des
// pronostics marqués `won` sans crédit, que plus rien ne relirait.
//
// LE PREMIER RÉSULTAT RÈGLE. Seuls les pronostics non réglés sont lus : une
// correction de score ultérieure ne reprend pas des pièces déjà versées — même
// posture que la victoire (`grantVictoryRewards`). Un match remis en attente
// puis rejoué ne rouvre pas non plus les pronostics déjà réglés.
//
// UN RÉSULTAT NON DÉFINITIF NE RÈGLE RIEN (`pending`, `ongoing`, `disputed`) :
// on attend l'issue, qui repassera par `applyMatchScore`.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { grantCoinsThenPacks } from '@/utils/tcg/grantCoinsThenPacks';
import { getEarnSource, MATCH_PREDICTION_COINS } from '@/utils/tcg/earnSources';
import { readPredictionExclusions } from './eligibility';
import {
  PREDICTION_MATCH_COLUMNS,
  predictionCutoff,
  predictionOutcome,
  settlePrediction,
  type PredictionMatch,
  type PredictionResult,
} from './rules';

/** Lecture par pages : PostgREST coupe toute réponse à 1000 lignes. */
const PAGE = 500;
const UPDATE_CHUNK = 100;

type PredictionRow = {
  id: string;
  user_id: string;
  predicted_winner_team_id: string;
  updated_at: string;
};

export type SettleReport =
  | { ok: true; settled: number; credited: number }
  | { ok: false; reason: 'not_final' | 'failed'; message?: string };

async function readUnsettled(
  tenantId: string,
  matchId: string
): Promise<{ ok: true; rows: PredictionRow[] } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };
  const rows: PredictionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('match_predictions')
      .select('id, user_id, predicted_winner_team_id, updated_at')
      .eq('tenant_id', tenantId)
      .eq('match_id', matchId)
      .is('settled_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, error: error.message };
    const page = (data ?? []) as PredictionRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return { ok: true, rows };
}

export async function settleMatchPredictions(
  tenantId: string,
  matchId: string
): Promise<SettleReport> {
  if (!supabaseAdmin) return { ok: false, reason: 'failed' };
  try {
    const { data: matchData, error: matchError } = await supabaseAdmin
      .from('matches')
      .select(PREDICTION_MATCH_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('id', matchId)
      .maybeSingle();
    if (matchError || !matchData) {
      logger.error(
        '[predictions] match %s illisible: %s',
        matchId,
        matchError?.message ?? 'introuvable'
      );
      return { ok: false, reason: 'failed', message: matchError?.message };
    }
    const match = matchData as unknown as PredictionMatch;
    const outcome = predictionOutcome(match);
    if (outcome.kind === 'pending') return { ok: false, reason: 'not_final' };

    const read = await readUnsettled(tenantId, matchId);
    if (!read.ok) {
      logger.error('[predictions] pronostics illisibles: %s', read.error);
      return { ok: false, reason: 'failed', message: read.error };
    }
    if (read.rows.length === 0) return { ok: true, settled: 0, credited: 0 };

    const exclusions = await readPredictionExclusions(
      match,
      read.rows.map((row) => row.user_id)
    );
    if (!exclusions.ok) {
      // Ne rien régler plutôt que de payer une joueuse sur son propre match.
      logger.error('[predictions] exclusions illisibles: %s', exclusions.error);
      return { ok: false, reason: 'failed', message: exclusions.error };
    }

    const cutoff = predictionCutoff(match);
    const results = new Map<PredictionResult, string[]>([
      ['won', []],
      ['lost', []],
      ['void', []],
    ]);
    const winners: string[] = [];
    for (const row of read.rows) {
      const result = settlePrediction({
        predictedTeamId: row.predicted_winner_team_id,
        updatedAt: row.updated_at,
        outcome,
        excluded: exclusions.value.has(row.user_id),
        cutoff,
      });
      results.get(result)?.push(row.id);
      if (result === 'won') winners.push(row.user_id);
    }

    let credited = 0;
    if (winners.length > 0) {
      if (!getEarnSource('match_prediction')?.schemaReady) {
        // Le drapeau COMMANDE (cf. `earnSources.ts`) : sans lui, on ne marque
        // rien non plus, pour que le règlement suivant paie.
        logger.warn('[predictions] source match_prediction non prête');
        return { ok: false, reason: 'failed', message: 'schema_not_ready' };
      }
      const grant = await grantCoinsThenPacks({
        tenantId,
        walletSourceKind: 'match_prediction',
        packSourceKind: null,
        grants: winners.map((userId) => ({
          userId,
          sourceRef: matchId,
          coins: MATCH_PREDICTION_COINS,
          packs: 0,
        })),
      });
      if (!grant.ok) {
        // Aucun marquage : les pronostics restent à régler, et le crédit déjà
        // écrit pour certaines ne se répétera pas au prochain passage.
        return { ok: false, reason: 'failed', message: grant.message };
      }
      credited = grant.credited.length;
    }

    const settledAt = new Date().toISOString();
    let settled = 0;
    for (const [result, ids] of results) {
      // Par tranches : des UUID dans l'URL de la requête.
      for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
        const { data, error } = await supabaseAdmin
          .from('match_predictions')
          .update({ result, settled_at: settledAt })
          .eq('tenant_id', tenantId)
          .in('id', ids.slice(i, i + UPDATE_CHUNK))
          // Un règlement concurrent a pu passer : on ne réécrit pas le sien.
          .is('settled_at', null)
          .select('id');
        if (error) {
          logger.error(
            '[predictions] marquage « %s » impossible: %s',
            result,
            error.message
          );
          continue;
        }
        settled += (data ?? []).length;
      }
    }

    return { ok: true, settled, credited };
  } catch (err) {
    logger.error('[predictions] règlement du match %s en échec', matchId, err);
    return { ok: false, reason: 'failed' };
  }
}
