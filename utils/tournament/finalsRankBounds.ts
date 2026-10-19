// utils/tournament/finalsRankBounds.ts
//
// LES RANGS ENCORE POSSIBLES de chaque équipe d'une saison régulière (round
// robin), DÉPARTAGES COMPRIS — pour la course aux finales (finalsPhase.ts).
//
// POURQUOI. La course ne tranchait qu'aux points : une égalité POSSIBLE
// suffisait à laisser une équipe « en course ». Cup 2026, 19/10 : Venom
// Valkyries (9 pts, un match à jouer) ne peut plus finir qu'à égalité avec
// LVN ASHES (9 pts, saison finie), qu'elle a battue — et la confrontation
// directe est le premier départage. 4e quoi qu'il arrive, elle restait
// « en course ».
//
// COMMENT. Chaque issue des matchs restants (vainqueur ET score de série, pour
// les départages au score) est rejouée par le calcul OFFICIEL du classement
// (`computeStageStandings`, sur les lectures déjà faites : ordre de départage
// de la phase, départages manuels, disqualifications). On retient le meilleur
// et le pire rang de chaque équipe. Aucun pronostic : un rang n'est acquis que
// s'il l'est dans toutes les issues.
//
// LIMITES, ASSUMÉES — hors de ces cas, `null`, et la course retombe sur la
// règle aux points, prudente :
//   - phase `round_robin` seule (la suisse met son classement en cache par
//     phase ; les poules n'ont pas de projection) ;
//   - séries au meilleur d'un nombre IMPAIR de manches (bo1, bo3, bo5…) : un
//     format pair ou inconnu admettrait un nul qu'on ne simule pas ;
//   - au plus MAX_RANK_SCENARIOS issues (bo3 : 6 matchs restants) — en début
//     de saison, rien n'est acquis de toute façon ;
//   - des issues « normales » : une disqualification à venir ou un forfait au
//     score atypique ne sont pas envisagés.
//
// COÛT. Les 3 lectures de `prefetchStandingsInputs`, seulement quand il reste
// des matchs ET que le nombre d'issues passe sous le plafond — vérifié avant,
// sur les matchs que la page a déjà lus. Le reste se calcule en mémoire.

import { logger } from '@/utils/logger';
import {
  computeStageStandings,
  type PrefetchedStageInputs,
  type StageMatchRow,
} from '@/utils/stages/standings';
import { prefetchStandingsInputs } from '@/utils/stages/publicStandings';
import { isCountedMatch, isCountedStatus } from '@/utils/stages/countedMatches';
import type { RankBounds } from './finalsPhase';

/** Plafond d'issues rejouées (4^6 : six séries en bo3). */
export const MAX_RANK_SCENARIOS = 4096;

type Score = [team1: number, team2: number];

/**
 * Les scores de série possibles d'un format au meilleur de N (N impair), du
 * point de vue de team1. `null` pour un format pair, inconnu ou absent.
 */
export function seriesOutcomes(
  format: string | null | undefined
): Score[] | null {
  const m = /^bo(\d+)$/.exec((format ?? '').trim().toLowerCase());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n % 2 === 0) return null;
  const toWin = (n + 1) / 2;
  const out: Score[] = [];
  for (let lost = 0; lost < toWin; lost++) {
    out.push([toWin, lost], [lost, toWin]);
  }
  return out;
}

/**
 * Nombre d'issues à rejouer pour ces formats, ou `null` si l'un d'eux ne se
 * simule pas. Au-delà du plafond, le compte s'arrête (la valeur rendue le
 * dépasse, sans être exacte).
 */
export function countScenarios(
  formats: Array<string | null | undefined>
): number | null {
  let total = 1;
  for (const format of formats) {
    const outcomes = seriesOutcomes(format);
    if (!outcomes) return null;
    total *= outcomes.length;
    if (total > MAX_RANK_SCENARIOS) return total;
  }
  return total;
}

/**
 * Meilleur et pire rang de chaque équipe de la phase, toutes issues des
 * matchs restants confondues. PURE en pratique : `inputs` porte toutes les
 * lectures, le calcul officiel n'en refait aucune.
 *
 * `null` quand le calcul ne s'applique pas (cf. LIMITES en tête).
 */
export async function computeRankBounds(input: {
  tenantId: string;
  stage: { id: string; stage_type: string };
  inputs: PrefetchedStageInputs;
  formatOf: (matchId: string) => string | null | undefined;
}): Promise<Map<string, RankBounds> | null> {
  const { tenantId, stage, inputs } = input;
  if (stage.stage_type !== 'round_robin') return null;
  if (inputs.matches.error || inputs.stageTeams.error) return null;

  const rows = inputs.matches.data ?? [];
  const open = rows.filter((m) => !m.is_bye && !isCountedMatch(m));
  const settled = rows.filter((m) => m.is_bye || isCountedMatch(m));

  const choices: Score[][] = [];
  for (const m of open) {
    if (!m.team1_id || !m.team2_id) return null;
    const outcomes = seriesOutcomes(input.formatOf(m.id));
    if (!outcomes) return null;
    choices.push(outcomes);
  }
  const total = choices.reduce((n, c) => n * c.length, 1);
  if (total > MAX_RANK_SCENARIOS) return null;

  const bounds = new Map<string, RankBounds>();
  for (let scenario = 0; scenario < total; scenario++) {
    // Numération à base mixte : le n-ième chiffre choisit l'issue du n-ième
    // match restant.
    let rest = scenario;
    const played: StageMatchRow[] = open.map((m, i) => {
      const outcomes = choices[i];
      const [s1, s2] = outcomes[rest % outcomes.length];
      rest = Math.floor(rest / outcomes.length);
      return {
        ...m,
        status: 'finished',
        team1_score: s1,
        team2_score: s2,
        winner_team_id: s1 > s2 ? m.team1_id : m.team2_id,
      };
    });
    const standings = await computeStageStandings(
      tenantId,
      stage.id,
      stage.stage_type,
      { ...inputs, matches: { data: [...settled, ...played], error: null } }
    );
    for (const s of standings) {
      const b = bounds.get(s.teamId);
      if (!b) {
        bounds.set(s.teamId, { best: s.rank, worst: s.rank });
      } else {
        if (s.rank < b.best) b.best = s.rank;
        if (s.rank > b.worst) b.worst = s.rank;
      }
    }
  }
  return bounds.size > 0 ? bounds : null;
}

/** Un match du tournoi tel que la page Bracket l'a déjà lu. */
export type PageMatchRef = {
  id: string;
  stage_id: string | null;
  status: string;
  is_bye: boolean | null;
  match_format: string | null;
};

/**
 * Lit puis calcule les rangs encore possibles de la phase de classement.
 *
 * `pageMatches` (déjà lus par la page) décident AVANT toute lecture s'il y a
 * lieu de calculer : saison finie (les rangs tranchent déjà), format non
 * simulable ou trop d'issues → `null`, sans requête. Ne lève jamais : une
 * panne laisse la course à la règle aux points.
 */
export async function readFinalsRankBounds(
  tenantId: string,
  stage: { id: string; stage_type: string; settings?: unknown } | null,
  pageMatches: PageMatchRef[]
): Promise<Map<string, RankBounds> | null> {
  if (!stage || stage.stage_type !== 'round_robin') return null;
  const ofStage = pageMatches.filter((m) => m.stage_id === stage.id);
  const remaining = ofStage.filter(
    (m) => !m.is_bye && !isCountedStatus(m.status)
  );
  if (remaining.length === 0) return null;
  const count = countScenarios(remaining.map((m) => m.match_format));
  if (count === null || count > MAX_RANK_SCENARIOS) return null;

  const formats = new Map(ofStage.map((m) => [m.id, m.match_format]));
  try {
    const prefetch = await prefetchStandingsInputs(tenantId, [stage]);
    return await computeRankBounds({
      tenantId,
      stage,
      inputs: prefetch.stageInputs(stage),
      formatOf: (id) => formats.get(id),
    });
  } catch (err) {
    logger.error('[finalsRankBounds] error', err);
    return null;
  }
}
