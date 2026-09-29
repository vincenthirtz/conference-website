// features/player/matches/schemas.ts — matchs de la joueuse : liste, fil du
// match, déclaration de score, feuille de match (lot P12). Zod seul :
// importé par les routes, le registre OpenAPI (lib/apiContracts) et le client.

import { z } from 'zod';
import type {
  PlayerCheckin,
  TeamRef,
  TournamentRef,
} from '@/utils/matches/playerMatchView';
import type { ScoreReportState } from '@/utils/matches/scoreReports';

/**
 * Corps de PUT / POST /api/teams/matches/{matchId}/lineup.
 *
 * `starters` absent = « valide ce qui est déjà enregistré » (POST) ; présent,
 * c'est la composition proposée. L'éligibilité (roster jouant, format, pas de
 * doublon) reste décidée par `validateLineup` (utils/matches/lineup.ts) : le
 * schéma ne fixe que la FORME.
 */
export const LineupBody = z.object({
  starters: z
    .array(z.string(), {
      error: 'La composition doit être une liste de joueuses.',
    })
    .optional(),
});
export type LineupInput = z.infer<typeof LineupBody>;

/** Corps de POST /api/player/matches/{matchId}/report-score. */
export const ReportScoreBody = z.object({
  team1Score: z.number().int().min(0),
  team2Score: z.number().int().min(0),
});
export type ReportScoreInput = z.infer<typeof ReportScoreBody>;

/* ------------------------------------------------------------------------
 * Formes de réponse (types seuls : lus par l'écran, jamais validés).
 * --------------------------------------------------------------------- */

export type { ScoreReportState };

/** Une ligne de « Mes matchs » (GET /api/player/matches). */
export type PlayerMatch = {
  id: string;
  scheduledAt: string | null;
  status: string;
  roundName: string | null;
  format: string | null;
  bestOf: number | null;
  streamUrl: string | null;
  slot: 1 | 2;
  opponent: { id: string; name: string } | null;
  score: { mine: number | null; opponent: number | null } | null;
  result: 'win' | 'loss' | 'draw' | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  checkin: {
    /** `null` pour qui ne peut pas pointer (cf. `canCheckIn`). */
    token: string | null;
    /** Capitaine, coach ou manager (utils/teams/canCheckIn.ts). */
    canCheckIn: boolean;
    alreadyCheckedIn: boolean;
    /** Window opens at scheduledAt - CHECKIN_OPEN_MINUTES, closes at scheduledAt. */
    opensAt: string | null;
    closesAt: string | null;
    /** Convenience flags for the UI; computed from server clock. */
    isOpen: boolean;
    isPassed: boolean;
  } | null;
  /**
   * Le serveur acceptera-t-il un report de score de CETTE personne ? Même
   * règle que la déclaration (service/reportRight.ts) : capitaine au sens
   * strict, deux équipes assignées, match non clôturé. Le MOMENT (coup
   * d'envoi passé) reste au client (utils/matches/playerMatchLive).
   */
  canReportScore: boolean;
};

export type PlayerMatchesPayload = {
  team: { id: string; name: string } | null;
  matches: PlayerMatch[];
};

/** Le fil d'UN match (GET /api/player/matches/{matchId}). */
export type PlayerMatchDetail = {
  match: {
    id: string;
    scheduledAt: string | null;
    status: string;
    format: string | null;
    bestOf: number | null;
    roundName: string | null;
    streamUrl: string | null;
  };
  team: { id: string; name: string; slot: 1 | 2 };
  opponent: TeamRef;
  tournament: TournamentRef;
  /**
   * `token` n'est renseigné que pour qui peut pointer (capitaine, coach,
   * manager) ; l'état (`isOpen`, `alreadyCheckedIn`…) reste visible de toute
   * l'équipe.
   */
  checkin: PlayerCheckin & { canCheckIn: boolean };
  /** `null` quand le tournoi n'impose pas de minimum. */
  readiness: {
    minPlayers: number | null;
    rosterSize: number;
    shortfall: number;
  } | null;
  score: { mine: number | null; opponent: number | null } | null;
  result: 'win' | 'loss' | 'draw' | null;
  report: {
    state: ScoreReportState;
    /** Ce que MON équipe a déjà déclaré, `null` si rien. */
    mine: { mine: number; opponent: number } | null;
  };
  /** Ce que l'appelant peut faire ICI (mêmes règles que les écritures). */
  permissions: {
    validateLineup: boolean;
    reportScore: boolean;
  };
};
