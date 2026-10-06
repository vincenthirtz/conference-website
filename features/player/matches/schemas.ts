// features/player/matches/schemas.ts — matchs de la joueuse : liste, fil du
// match, déclaration de score, feuille de match (lot P12). Zod seul :
// importé par les routes, le registre OpenAPI (lib/apiContracts) et le client.

import * as z from 'zod';
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

/**
 * Plafond d'une capture déposée depuis le site. Plus bas que celui du bot
 * (MAX_EVIDENCE_BYTES, 10 Mo) : le corps JSON porte l'image en base64 (+33 %)
 * et une fonction Netlify refuse au-delà de 6 Mo de requête.
 */
export const PLAYER_EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;

/** Base64 de PLAYER_EVIDENCE_MAX_BYTES, préfixe `data:` compris. */
const PLAYER_EVIDENCE_MAX_BASE64 =
  Math.ceil(PLAYER_EVIDENCE_MAX_BYTES / 3) * 4 + 64;

/**
 * Corps de POST /api/player/matches/{matchId}/evidence : UNE capture d'écran
 * (PNG, JPEG ou WebP — vérifié sur les octets, jamais sur le type déclaré).
 */
export const EvidenceUploadBody = z.object({
  file_base64: z
    .string()
    .min(1, 'Fichier manquant.')
    .max(PLAYER_EVIDENCE_MAX_BASE64, 'Fichier trop lourd.'),
  filename: z.string().trim().min(1).max(255).optional(),
  note: z.string().trim().max(500).optional(),
});
export type EvidenceUploadInput = z.infer<typeof EvidenceUploadBody>;

export type EvidenceUploadResult = { id: string; kind: 'screenshot' };

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
   * règle que la déclaration (service/reportRight.ts) : capitaine ou manager
   * d'équipe (pas des deux équipes), deux équipes assignées, match non
   * clôturé. Le MOMENT (coup
   * d'envoi passé) reste au client (utils/matches/playerMatchLive).
   */
  canReportScore: boolean;
};

export type PlayerMatchesPayload = {
  team: { id: string; name: string } | null;
  matches: PlayerMatch[];
};

/** Un litige ouvert, vu d'un côté du match. */
export type PlayerMatchDispute = {
  /** Ce que l'ADVERSAIRE a déclaré, dans MA perspective ; `null` si rien. */
  opponentReport: { mine: number; opponent: number } | null;
  /** Ouverture du litige (ISO) ; `null` si elle n'est pas datée. */
  openedAt: string | null;
  /**
   * Délai d'arbitrage visé, en minutes : `tenants.dispute_sla_minutes`, le
   * seuil du cron dispute-sla-check qui relance le staff.
   */
  slaMinutes: number;
  /** `openedAt + slaMinutes` ; `null` sans date d'ouverture. */
  expectedBy: string | null;
  /** Ouvert par le staff, et non par le désaccord des deux déclarations. */
  openedByStaff: boolean;
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
    /**
     * Le litige, UNIQUEMENT une fois ouvert (`match.status === 'disputed'`) ;
     * `null` sinon. Avant, la déclaration adverse reste secrète : la montrer
     * permettrait de recopier le score de l'autre au lieu de déclarer le sien.
     */
    dispute: PlayerMatchDispute | null;
  };
  /** Ce que l'appelant peut faire ICI (mêmes règles que les écritures). */
  permissions: {
    validateLineup: boolean;
    reportScore: boolean;
  };
};
