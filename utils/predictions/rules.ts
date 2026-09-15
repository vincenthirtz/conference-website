// utils/predictions/rules.ts
//
// Règles des pronostics sur les matchs de tournoi. Module PUR (aucune I/O) :
// l'API (`pages/api/player/predictions/*`) et le règlement
// (`utils/predictions/settle.ts`) posent la même question — « ce match
// accepte-t-il un pronostic ? », « ce pronostic est-il payé ? » — et doivent
// y répondre pareil.
//
// CE N'EST PAS UN PARI. Un pronostic ne coûte rien, les pièces ne s'achètent
// pas (`utils/tcg/economy.ts`) : sans mise, pas de jeu d'argent. Rien ici ne
// connaît de mise, et ce n'est pas un oubli.
//
// LE VERROU DE RÉFÉRENCE EST EN BASE. Le déclencheur `match_predictions_guard`
// (`database/migrations/match_predictions.sql`) applique `predictionWindow`
// dans la transaction d'écriture ; cette copie sert à l'AFFICHAGE et à un refus
// lisible avant d'écrire. Les deux doivent rester alignées : le test unitaire
// relit la migration pour le vérifier.

/** Colonnes de `matches` dont les règles ont besoin. */
export const PREDICTION_MATCH_COLUMNS =
  'id, tenant_id, tournament_id, scrim_id, team1_id, team2_id, winner_team_id, forfeit_team_id, status, is_bye, deleted_at, scheduled_at, started_at, completed_at';

export type PredictionMatch = {
  id: string;
  tenant_id: string;
  tournament_id: string | null;
  scrim_id: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  forfeit_team_id: string | null;
  status: string;
  is_bye: boolean | null;
  deleted_at: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

/**
 * `open` : on peut pronostiquer ou changer d'avis.
 * `locked` : trop tard — lancé, heure passée, ou plus en attente.
 * `not_predictable` : ce match n'a jamais été ouvert aux pronostics (bye,
 * miroir de scrim, supprimé, équipe encore inconnue).
 */
export type PredictionWindow = 'open' | 'locked' | 'not_predictable';

/** Un match de TOURNOI entre deux équipes connues. */
export function isPredictableMatch(match: PredictionMatch): boolean {
  return (
    !match.deleted_at &&
    !match.is_bye &&
    // Un scrim se négocie entre deux équipes, sans public : et son miroir se
    // retire et se recrée, ce qui rouvrirait un pronostic déjà réglé.
    !match.scrim_id &&
    Boolean(match.tournament_id) &&
    Boolean(match.team1_id) &&
    Boolean(match.team2_id)
  );
}

export function predictionWindow(
  match: PredictionMatch,
  now: Date
): PredictionWindow {
  if (!isPredictableMatch(match)) return 'not_predictable';
  if (match.status !== 'pending' || match.started_at) return 'locked';
  if (match.scheduled_at) {
    const at = Date.parse(match.scheduled_at);
    // Une date illisible verrouille : dans le doute, on ne laisse pas
    // pronostiquer un match dont on ne sait pas s'il a commencé.
    if (!Number.isFinite(at) || at <= now.getTime()) return 'locked';
  }
  return 'open';
}

export type PredictionOutcome =
  /** Pas encore de résultat définitif : rien à régler. */
  | { kind: 'pending' }
  /** Rien n'est payé, à personne : forfait, walkover, annulation. */
  | { kind: 'void' }
  | { kind: 'decided'; winnerTeamId: string };

/**
 * L'issue d'un match du point de vue des pronostics.
 *
 * UN FORFAIT NE SE DEVINE PAS, IL SE DÉCIDE. Payer les pronostics sur un
 * walkover reviendrait à laisser une équipe offrir des pièces à celles qui ont
 * misé sur l'adversaire, en déclarant forfait. Un forfait règle donc tout en
 * `void`.
 */
export function predictionOutcome(match: PredictionMatch): PredictionOutcome {
  if (!isPredictableMatch(match)) return { kind: 'void' };
  if (match.status === 'cancelled') return { kind: 'void' };
  if (match.status === 'walkover' || match.forfeit_team_id) {
    return { kind: 'void' };
  }
  if (match.status !== 'finished') return { kind: 'pending' };
  const winner = match.winner_team_id;
  if (!winner || (winner !== match.team1_id && winner !== match.team2_id)) {
    // Terminé sans vainqueur lisible (nul, donnée corrompue) : on ne paie pas
    // sur une issue qu'on ne sait pas lire.
    return { kind: 'void' };
  }
  return { kind: 'decided', winnerTeamId: winner };
}

/**
 * L'instant après lequel un pronostic ne compte plus, même s'il a été écrit.
 *
 * Défense en profondeur derrière le déclencheur : le lancement réel, à défaut
 * la fin. PAS l'heure prévue — un match reprogrammé plus tard rouvre
 * légitimement les pronostics, et une ancienne heure prévue les rendrait tous
 * tardifs.
 */
export function predictionCutoff(match: PredictionMatch): number | null {
  const candidates = [match.started_at, match.completed_at]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

export type PredictionResult = 'won' | 'lost' | 'void';

/**
 * Le résultat d'UN pronostic, une fois l'issue connue.
 *
 * `void` pour qui ne devait pas pronostiquer ce match — une joueuse finalement
 * sur la feuille de match, un membre du staff — et pour un pronostic postérieur
 * au lancement : ni payé, ni compté comme perdu.
 */
export function settlePrediction(input: {
  predictedTeamId: string;
  updatedAt: string;
  outcome: Exclude<PredictionOutcome, { kind: 'pending' }>;
  excluded: boolean;
  cutoff: number | null;
}): PredictionResult {
  if (input.outcome.kind === 'void' || input.excluded) return 'void';
  const at = Date.parse(input.updatedAt);
  if (!Number.isFinite(at)) return 'void';
  if (input.cutoff !== null && at >= input.cutoff) return 'void';
  return input.predictedTeamId === input.outcome.winnerTeamId ? 'won' : 'lost';
}

/**
 * Pourquoi une personne ne peut pas pronostiquer un match, ou `null`.
 *
 * `participant` : elle est au roster de l'une des deux équipes (ou en est la
 * capitaine) — pronostiquer son propre match, c'est être payée pour un
 * résultat qu'on peut orienter. `staff` : le staff saisit et corrige les
 * scores.
 */
export type PredictionIneligibility = 'participant' | 'staff';
