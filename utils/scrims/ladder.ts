// utils/scrims/ladder.ts
//
// Classement permanent des scrims (R8).
//
// Ce que c'est : un classement des ENTRAÎNEMENTS, avec son propre barème —
// points, joués, gagnés, nuls, perdus. Il répond à « qui s'entraîne, et avec
// quels résultats », là où le Glicko-2 répond à « quel niveau ».
//
// NOTE (2026-08-24) : ce module portait la règle inverse — les scrims ne
// devaient JAMAIS toucher au rating, au motif qu'une partie amicale à roster
// incomplet corromprait le classement officiel. Décision produit revenue
// dessus : un scrim CLASSÉ compte désormais aussi pour le rating des joueuses
// (cf. utils/scrims/ratedMatch.ts). Le garde-fou n'est plus le type d'épreuve
// mais le drapeau `ranked` : un entraînement à roster incomplet se coche
// `ranked = false` et ne touche ni au ladder ni au rating. Les deux
// classements restent calculés séparément, sur la même porte d'entrée.
//
// Le classement se calcule À LA VOLÉE depuis `scrims` : pas de table de
// standings à maintenir en cohérence, donc pas de dérive possible entre le
// résultat d'un scrim et le classement. À l'échelle attendue (dizaines
// d'équipes, centaines de scrims), c'est une lecture indexée triviale.
//
// Seuls comptent les scrims `status='completed'` ET `ranked=true` : un scrim
// d'entraînement peut être explicitement exclu du classement.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Barème classique : victoire 3, nul 1, défaite 0. */
export const POINTS_WIN = 3;
export const POINTS_DRAW = 1;
export const POINTS_LOSS = 0;

export type LadderRow = {
  teamId: string;
  teamName: string;
  slug: string | null;
  logoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** Différence de manches (scores cumulés pour - contre). */
  scoreDiff: number;
  points: number;
  rank: number;
};

export type ScrimResultRow = {
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

type Aggregate = Omit<LadderRow, 'rank' | 'teamName' | 'slug' | 'logoUrl'>;

/**
 * Agrège des résultats de scrims en classement. PUR : testable sans base, et
 * c'est ici que vit toute la règle métier (barème, départages).
 *
 * Départages, dans l'ordre : points, puis différence de manches, puis nombre de
 * victoires, puis nom (stable et lisible — un classement qui change d'ordre à
 * chaque rechargement est inutilisable).
 */
export function computeLadder(
  results: ScrimResultRow[],
  teamNames: Map<
    string,
    { name: string; slug: string | null; logoUrl: string | null }
  >
): LadderRow[] {
  const agg = new Map<string, Aggregate>();

  const ensure = (teamId: string): Aggregate => {
    const found = agg.get(teamId);
    if (found) return found;
    const created: Aggregate = {
      teamId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      scoreDiff: 0,
      points: 0,
    };
    agg.set(teamId, created);
    return created;
  };

  for (const row of results) {
    const { team1_id: t1, team2_id: t2 } = row;
    // Un scrim sans les deux équipes ne dit rien : on l'ignore plutôt que de
    // fabriquer une ligne de classement bancale.
    if (!t1 || !t2) continue;
    if (row.team1_score == null || row.team2_score == null) continue;

    const a = ensure(t1);
    const b = ensure(t2);
    a.played += 1;
    b.played += 1;
    a.scoreDiff += row.team1_score - row.team2_score;
    b.scoreDiff += row.team2_score - row.team1_score;

    if (row.winner_team_id === t1) {
      a.won += 1;
      a.points += POINTS_WIN;
      b.lost += 1;
      b.points += POINTS_LOSS;
    } else if (row.winner_team_id === t2) {
      b.won += 1;
      b.points += POINTS_WIN;
      a.lost += 1;
      a.points += POINTS_LOSS;
    } else {
      // Pas de vainqueur ET scores renseignés = match nul.
      a.drawn += 1;
      b.drawn += 1;
      a.points += POINTS_DRAW;
      b.points += POINTS_DRAW;
    }
  }

  const rows = [...agg.values()].map((entry) => {
    const meta = teamNames.get(entry.teamId);
    return {
      ...entry,
      teamName: meta?.name ?? 'Équipe inconnue',
      slug: meta?.slug ?? null,
      logoUrl: meta?.logoUrl ?? null,
      rank: 0,
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
    if (b.won !== a.won) return b.won - a.won;
    return a.teamName.localeCompare(b.teamName);
  });

  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  return rows;
}

/** Charge et calcule le classement d'un tenant. Ne throw jamais. */
export async function loadLadder(tenantId: string): Promise<LadderRow[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data: scrimRows, error } = await supabaseAdmin
      .from('scrims')
      .select('team1_id, team2_id, team1_score, team2_score, winner_team_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .eq('ranked', true)
      .is('deleted_at', null);

    if (error) {
      logger.error('[ladder] scrims read error', error);
      return [];
    }

    const results = (scrimRows || []) as ScrimResultRow[];
    const teamIds = Array.from(
      new Set(results.flatMap((r) => [r.team1_id, r.team2_id]).filter(Boolean))
    ) as string[];

    const names = new Map<
      string,
      { name: string; slug: string | null; logoUrl: string | null }
    >();
    if (teamIds.length > 0) {
      const { data: teamRows } = await supabaseAdmin
        .from('teams')
        .select('id, name, slug, logo_url')
        .in('id', teamIds);
      for (const t of (teamRows || []) as Array<{
        id: string;
        name: string;
        slug: string | null;
        logo_url: string | null;
      }>) {
        names.set(t.id, { name: t.name, slug: t.slug, logoUrl: t.logo_url });
      }
    }

    return computeLadder(results, names);
  } catch (err) {
    logger.error('[ladder] crash', err);
    return [];
  }
}
