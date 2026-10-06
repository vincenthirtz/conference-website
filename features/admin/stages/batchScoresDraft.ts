// features/admin/stages/batchScoresDraft.ts — logique PURE de la grille de
// saisie rapide des scores d'une phase (features/admin/stages/ui/
// BatchScoresGrid) : rounds, matchs jouables, valeurs initiales, et
// construction du lot envoyé à `POST /api/admin/stages/[id]/batch-scores`.
//
// Séparée de l'écran pour être testée sans DOM.

import type { BatchScoreEntry } from './client';

export type GridMatch = {
  id: string;
  round_number: number | null;
  round_name?: string | null;
  status: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  team1?: { name?: string | null } | null;
  team2?: { name?: string | null } | null;
};

/** Saisie brute d'une ligne (chaînes : le champ peut être vide). */
export type ScoreCell = { team1: string; team2: string };

export type RowError = 'bsErrBothScores' | 'bsErrNotInteger' | 'bsErrTie';

/** Taille maximale d'un appel (cf. service/matchOps `batchScores`). */
export const BATCH_SCORES_MAX = 50;

/** Statuts dont les scores sont un RÉSULTAT (pré-remplis dans la grille). */
const RESULT_STATUSES = new Set(['finished', 'walkover', 'disputed']);

/** Rounds présents, croissants ; `null` (sans round) en dernier. */
export function roundsOf(matches: GridMatch[]): Array<number | null> {
  const set = new Set(matches.map((m) => m.round_number ?? null));
  return [...set].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });
}

/** Un score ne se saisit que pour deux équipes connues, match non annulé. */
export function isPlayable(m: GridMatch): boolean {
  return Boolean(m.team1_id && m.team2_id) && m.status !== 'cancelled';
}

/**
 * Valeur de départ d'une ligne : le résultat s'il y en a un, sinon vide —
 * un match « pending » porte souvent 0-0 en base, ce n'est pas un score.
 */
export function initialCell(m: GridMatch): ScoreCell {
  if (!RESULT_STATUSES.has(m.status ?? '')) return { team1: '', team2: '' };
  return {
    team1: m.team1_score == null ? '' : String(m.team1_score),
    team2: m.team2_score == null ? '' : String(m.team2_score),
  };
}

function parseScore(raw: string): number | null {
  const v = raw.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Lot à envoyer : seules les lignes MODIFIÉES (par rapport à `initialCell`)
 * des matchs jouables. Une ligne modifiée mais invalide va dans `errors` et
 * n'est pas envoyée. `forbidTies` : bracket (élimination) — une égalité n'y
 * désigne aucun vainqueur.
 */
export function buildBatch(
  matches: GridMatch[],
  edits: Record<string, ScoreCell>,
  { forbidTies }: { forbidTies: boolean }
): { entries: BatchScoreEntry[]; errors: Record<string, RowError> } {
  const entries: BatchScoreEntry[] = [];
  const errors: Record<string, RowError> = {};
  for (const m of matches) {
    const cell = edits[m.id];
    if (!cell || !isPlayable(m)) continue;
    const init = initialCell(m);
    if (cell.team1.trim() === init.team1 && cell.team2.trim() === init.team2) {
      continue;
    }
    if (!cell.team1.trim() || !cell.team2.trim()) {
      errors[m.id] = 'bsErrBothScores';
      continue;
    }
    const s1 = parseScore(cell.team1);
    const s2 = parseScore(cell.team2);
    if (s1 === null || s2 === null) {
      errors[m.id] = 'bsErrNotInteger';
      continue;
    }
    if (forbidTies && s1 === s2) {
      errors[m.id] = 'bsErrTie';
      continue;
    }
    entries.push({ matchId: m.id, team1Score: s1, team2Score: s2 });
  }
  return { entries, errors };
}

/** Découpe en appels de `BATCH_SCORES_MAX` (ordre conservé). */
export function chunkEntries<T>(entries: T[], size = BATCH_SCORES_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < entries.length; i += size) {
    out.push(entries.slice(i, i + size));
  }
  return out;
}
