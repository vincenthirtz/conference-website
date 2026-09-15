// utils/predictions/readLeaderboard.ts
//
// Lecture du classement des pronostiqueuses : les pronostics réglés d'un
// espace (ou d'un tournoi), cumulés par personne, puis NOMMÉS avec parcimonie.
//
// ON COMPTE TOUT LE MONDE, ON NE NOMME QUE SUR ACCORD. Le rang se calcule sur
// l'ensemble des pronostics — sinon le classement mentirait sur qui est
// devant. Le NOM, lui, n'apparaît que si la personne l'a accepté
// (`match_prediction_settings`), et chacune voit toujours sa propre ligne :
// c'est la même règle que la découverte entre joueuses, opt-in par défaut.
//
// LE PLAFOND EST DIT, PAS DEVINÉ. PostgREST coupe toute réponse à 1000 lignes :
// on lit par tranches jusqu'à `MAX_ROWS`, et le compte rendu porte `truncated`
// quand la limite mord — un classement partiel qui se croit complet serait
// faux sans que rien ne le signale.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';
import { MATCH_PREDICTION_COINS } from '@/utils/tcg/earnSources';
import {
  buildLeaderboard,
  findMyStanding,
  MIN_SETTLED_FOR_RANK,
  type RankedPredictor,
  type SettledPrediction,
} from './leaderboard';

/** Lecture par tranches : PostgREST coupe à 1000 lignes. */
const PAGE = 1000;
/** Plafond de lecture : au-delà, le classement est annoncé partiel. */
const MAX_ROWS = 20_000;
/** Lignes nommées rendues à l'écran. */
const TOP_SIZE = 20;
/** Taille des listes `in (...)` : des UUID dans l'URL. */
const CHUNK = 100;

export type LeaderboardRow = {
  rank: number;
  settled: number;
  correct: number;
  accuracy: number;
  coins: number;
  /** `null` quand la personne n'a pas accepté d'être nommée. */
  displayName: string | null;
  isMe: boolean;
};

export type MyStanding = {
  rank: number | null;
  settled: number;
  correct: number;
  accuracy: number;
  coins: number;
  /** Pronostics restant à régler pour entrer au classement. */
  missing: number;
};

export type PredictionLeaderboardResponse = {
  rows: LeaderboardRow[];
  me: MyStanding | null;
  /** La personne accepte-t-elle d'être nommée ? */
  showsMyName: boolean;
  minSettled: number;
  participants: number;
  truncated: boolean;
  /** Pièces d'un pronostic juste, pour que l'écran n'ait pas à les connaître. */
  reward: number;
};

type Read<T> = { ok: true; value: T } | { ok: false; error: string };

/** Les matchs d'un tournoi, pour restreindre le classement à une édition. */
async function readTournamentMatchIds(
  tenantId: string,
  tournamentId: string
): Promise<Read<string[]>> {
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, error: error.message };
    const page = (data ?? []) as Array<{ id: string }>;
    ids.push(...page.map((row) => row.id));
    if (page.length < PAGE || ids.length >= MAX_ROWS) break;
  }
  return { ok: true, value: ids };
}

async function readSettledPredictions(
  tenantId: string,
  matchIds: string[] | null
): Promise<Read<{ rows: SettledPrediction[]; truncated: boolean }>> {
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };
  const rows: SettledPrediction[] = [];
  let truncated = false;

  // Sans filtre de tournoi : une seule pagination. Avec : une par tranche
  // d'identifiants de matchs (les listes `in (...)` voyagent dans l'URL).
  const filters: Array<string[] | null> = matchIds
    ? Array.from({ length: Math.ceil(matchIds.length / CHUNK) }, (_, i) =>
        matchIds.slice(i * CHUNK, (i + 1) * CHUNK)
      )
    : [null];

  for (const filter of filters) {
    for (let from = 0; ; from += PAGE) {
      let query = supabaseAdmin
        .from('match_predictions')
        .select('user_id, result')
        .eq('tenant_id', tenantId)
        .not('result', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (filter) query = query.in('match_id', filter);
      const { data, error } = await query;
      if (error) return { ok: false, error: error.message };
      const page = (data ?? []) as Array<{
        user_id: string;
        result: SettledPrediction['result'];
      }>;
      rows.push(
        ...page.map((row) => ({ userId: row.user_id, result: row.result }))
      );
      if (page.length < PAGE) break;
      if (rows.length >= MAX_ROWS) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  return { ok: true, value: { rows, truncated } };
}

/** Qui, parmi ces personnes, accepte d'être nommée ? */
async function readNamedOptIns(
  tenantId: string,
  userIds: string[]
): Promise<Read<Set<string>>> {
  const shown = new Set<string>();
  if (userIds.length === 0) return { ok: true, value: shown };
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const { data, error } = await supabaseAdmin
      .from('match_prediction_settings')
      .select('user_id, show_in_leaderboard')
      .eq('tenant_id', tenantId)
      .in('user_id', userIds.slice(i, i + CHUNK));
    if (error) return { ok: false, error: error.message };
    for (const row of (data ?? []) as Array<{
      user_id: string;
      show_in_leaderboard: boolean | null;
    }>) {
      if (row.show_in_leaderboard) shown.add(row.user_id);
    }
  }
  return { ok: true, value: shown };
}

export async function readPredictionLeaderboard(input: {
  tenantId: string;
  userId: string;
  tournamentId?: string | null;
}): Promise<Read<PredictionLeaderboardResponse>> {
  const { tenantId, userId } = input;

  let matchIds: string[] | null = null;
  if (input.tournamentId) {
    const read = await readTournamentMatchIds(tenantId, input.tournamentId);
    if (!read.ok) return read;
    // Un tournoi sans match : classement vide, pas une lecture de tout l'espace.
    if (read.value.length === 0) {
      return {
        ok: true,
        value: {
          rows: [],
          me: null,
          showsMyName: false,
          minSettled: MIN_SETTLED_FOR_RANK,
          participants: 0,
          truncated: false,
          reward: MATCH_PREDICTION_COINS,
        },
      };
    }
    matchIds = read.value;
  }

  const predictions = await readSettledPredictions(tenantId, matchIds);
  if (!predictions.ok) return predictions;

  const leaderboard = buildLeaderboard(predictions.value.rows, {
    rewardCoins: MATCH_PREDICTION_COINS,
  });
  const top = leaderboard.ranked.slice(0, TOP_SIZE);

  const optIns = await readNamedOptIns(tenantId, [
    ...top.map((row) => row.userId),
    userId,
  ]);
  if (!optIns.ok) return optIns;

  // On ne demande le profil QUE des personnes nommables : une résolution de
  // nom pour quelqu'un qui reste anonyme n'a aucune raison d'avoir lieu.
  const namedIds = top
    .map((row) => row.userId)
    .filter((id) => optIns.value.has(id));
  const profiles = await fetchAdminUserProfiles(namedIds);

  const rows: LeaderboardRow[] = top.map((row) => ({
    rank: row.rank,
    settled: row.settled,
    correct: row.correct,
    accuracy: row.accuracy,
    coins: row.coins,
    displayName: optIns.value.has(row.userId)
      ? profiles.get(row.userId)?.display_name?.trim() || null
      : null,
    isMe: row.userId === userId,
  }));

  const mine = findMyStanding(leaderboard, userId);
  const me: MyStanding | null = mine
    ? {
        rank: (mine as RankedPredictor).rank ?? null,
        settled: mine.settled,
        correct: mine.correct,
        accuracy: mine.accuracy,
        coins: mine.coins,
        missing: Math.max(0, leaderboard.minSettled - mine.settled),
      }
    : null;

  if (predictions.value.truncated) {
    logger.warn(
      '[predictions] classement tronqué à %d lignes (espace %s)',
      MAX_ROWS,
      tenantId
    );
  }

  return {
    ok: true,
    value: {
      rows,
      me,
      showsMyName: optIns.value.has(userId),
      minSettled: leaderboard.minSettled,
      participants: leaderboard.ranked.length + leaderboard.pending.length,
      truncated: predictions.value.truncated,
      reward: MATCH_PREDICTION_COINS,
    },
  };
}

/** Enregistre (ou retire) l'accord d'être nommée au classement. */
export async function setLeaderboardVisibility(input: {
  tenantId: string;
  userId: string;
  show: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };
  const { error } = await supabaseAdmin
    .from('match_prediction_settings')
    .upsert(
      {
        tenant_id: input.tenantId,
        user_id: input.userId,
        show_in_leaderboard: input.show,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,user_id' }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
