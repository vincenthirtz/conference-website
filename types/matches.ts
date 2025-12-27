export type MatchStatus = 'pending' | 'ongoing' | 'finished' | 'cancelled';

export type MatchFormat = 'bo1' | 'bo2' | 'bo3' | 'bo5' | 'bo7';

export type SchedulerResourceId = string;

export interface MatchToSchedule {
  id: string;
  tournamentId: string;
  stageId: string | null;
  team1Id: string | null;
  team2Id: string | null;

  /** Format du match, ex: "bo3" */
  format: MatchFormat;

  /** Ressource souhaitée (stream ou lobby). Si null → "default". */
  resourceId?: SchedulerResourceId | null;

  /** Round / ordre logique pour la priorité de scheduling */
  roundNumber?: number | null;

  /** Priorité globale (plus petit = plus prioritaire) */
  priority?: number | null;

  /**
   * Horaire fixée (ne doit pas être déplacée).
   * Si défini, le scheduler l'utilise comme start forcé.
   */
  pinnedStartAt?: string | null;

  /** Match déjà verrouillé (le scheduler l'ignore) */
  locked?: boolean | null;
}

export interface TimeWindow {
  /** Début de la plage horaire disponible */
  start: Date;
  /** Fin de la plage horaire disponible */
  end: Date;
}

export interface AutoSchedulerConfig {
  /**
   * Plages horaires sur lesquelles on a le droit de planifier.
   * Ex : une journée de 10h à 22h, éventuellement plusieurs jours.
   */
  windows: TimeWindow[];

  /**
   * Durée estimée par format (en minutes).
   * Ex : { bo1: 20, bo3: 45, bo5: 70 }
   */
  estimatedDurationsMinutes: Partial<Record<MatchFormat, number>>;

  /**
   * Gap minimum entre deux matchs sur la même ressource (minutes).
   * Ex : nettoyer le lobby, pause stream, etc.
   */
  resourceGapMinutes?: number;

  /**
   * Gap minimum entre deux matchs pour la même équipe (minutes).
   * Ex : 15-20 minutes.
   */
  teamRestMinutes?: number;

  /**
   * Ressource par défaut si resourceId est absent.
   */
  defaultResourceId?: SchedulerResourceId;
}

export interface ScheduledMatch {
  matchId: string;
  resourceId: SchedulerResourceId;
  /**
   * Date de début/fin en ISO string,
   * prêtes à être insérées dans Supabase.
   */
  startAt: string;
  endAt: string;

  /** Format rappel pour info */
  format: MatchFormat;
}

export interface AutoScheduleResult {
  scheduled: ScheduledMatch[];
  /** Matchs qui n'ont pas pu être placés (par manque de place dans les time windows) */
  unscheduledMatchIds: string[];
}

export interface ApplyMatchScoreInput {
  /** ID du match à mettre à jour */
  matchId: string;

  /** Score global pour chaque équipe (maps / rounds gagnés, etc.) */
  team1Score: number;
  team2Score: number;

  /**
   * Status à appliquer :
   * - si absent et markFinished=true, on passera automatiquement à "finished"
   * - sinon on laisse le status tel quel (pas de changement).
   */
  status?: MatchStatus;

  /**
   * Forcer le vainqueur (utile pour des cas spéciaux, pénalités, FF, etc.).
   * Si absent, on le déduit des scores (si non égalité).
   * Si égalité et winnerTeamId non fourni → aucun vainqueur (pas de propagation bracket).
   */
  winnerTeamId?: string | null;

  /**
   * Si true, on force le match en "finished"
   * (si status n'est pas fourni explicitement).
   */
  markFinished?: boolean;

  /**
   * Date de complétion (ISO). Si non fournie et match terminé,
   * on utilise `new Date().toISOString()`.
   */
  completedAt?: string | null;

  /**
   * ID staff (staff_members.id) qui applique la modification,
   * pour log dans staff_logs.
   */
  staffId?: string | null;

  /**
   * Si true (par défaut), on reset puis propage la progression
   * dans le bracket (next_match_win/lose).
   */
  propagateBracket?: boolean;
}

export interface ApplyMatchScoreResult {
  matchId: string;
  updated: boolean;
  match?: any;
  winnerTeamId: string | null;
}

export interface PlannedSlot {
  start: Date;
  end: Date;
}
