// features/player/team/responses.ts — réponses des routes « équipe » de
// l'espace joueuse, lues par les cartes (components/player/*).
//
// Types seuls, déclarés ici et non dans les routes : l'UI ne tire jamais
// pages/api, même pour un type (playerBoundariesGuard règle 7, lot 4b). À part
// de `schemas.ts`, qui reste « zod seul » et sous son plafond de taille.

import type { TeamPermission } from '../../../utils/teamRoles';
import type { HealthIssue } from '../../../utils/teams/teamHealth';
import type { Encounter } from '../../../utils/teams/teamReviews';
import type { RhythmHeatmap } from '../../../utils/teams/teamRhythm';
import type { TrainingSuggestion } from '../../../utils/teams/trainingSuggestion';

/** `GET /api/player/my-teams` — une ligne par équipe encadrée. */
export type MyTeamRow = {
  team: {
    id: string;
    name: string;
    slug: string | null;
    logoUrl: string | null;
  };
  isCaptain: boolean;
  permissions: TeamPermission[];
  roster: {
    size: number;
    minPlayers: number | null;
    /** Manquants pour atteindre le minimum du prochain tournoi joué. */
    shortfall: number;
  };
  nextMatch: {
    id: string;
    scheduledAt: string | null;
    opponentName: string | null;
    checkedIn: boolean;
    checkinOpensAt: string | null;
    checkinIsOpen: boolean;
    lineupValidated: boolean;
  } | null;
  pendingJoinRequests: number;
};
export type MyTeamsPayload = { teams: MyTeamRow[] };

/** `GET /api/player/team-reviews` — l'historique des rencontres et leurs retours. */
export type TeamReviewsResponse = {
  teamId: string | null;
  teamName: string | null;
  encounters: Encounter[];
  /** Adversaires rencontrés, pour le filtre. */
  opponents: Array<{ id: string; name: string; count: number }>;
  reviewedCount: number;
};

/** `GET /api/player/team-health` — l'état de forme de l'équipe. */
export type TeamHealthResponse = {
  teamId: string | null;
  teamName: string | null;
  issues: HealthIssue[];
  blockingCount: number;
  memberCount: number;
  /** Effectif requis, et d'où il vient — l'UI l'explique différemment. */
  requiredStarters: number;
  requiredStartersSource: 'tournament' | 'lineup';
};

/** `GET /api/player/team-rhythm` — disponibilités, noyau et suggestion. */
export type TeamRhythmResponse = {
  teamId: string | null;
  teamName: string | null;
  /** Fuseau dans lequel la heatmap et le noyau sont exprimés. */
  referenceTimezone: string;
  /** Ma déclaration (clés de créneaux) et mon fuseau. */
  mySlots: string[];
  myTimezone: string;
  /** Nom d'affichage par `user_id` — pour dire QUI est dispo sur un créneau. */
  memberNames: Record<string, string>;
  /** Effectif pris en compte pour le seuil de noyau. */
  memberCount: number;
  /** Nombre de membres ayant déclaré quelque chose. */
  declaredCount: number;
  threshold: number;
  heatmap: RhythmHeatmap;
  coreSlots: string[];
  /** Prochaines occurrences réelles du noyau, prêtes pour une annonce. */
  suggestedSlots: string[];
  /**
   * Créneau d'entraînement suggéré (N6) : disponible et pourtant jamais joué.
   * `null` quand il n'y a rien à proposer — cas normal.
   */
  suggestion: TrainingSuggestion | null;
  /** Prochaines occurrences du seul créneau suggéré. */
  suggestionSlots: string[];
  /** L'utilisateur peut-il créer la recherche de scrim depuis le noyau ? */
  canAnnounce: boolean;
};
