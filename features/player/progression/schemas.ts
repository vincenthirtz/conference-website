// features/player/progression/schemas.ts — contrat de GET /api/player/progression.

import type { Milestone, RatingPoint } from '@/utils/teams/progression';

export type ProgressionResponse = {
  teamId: string | null;
  teamName: string | null;
  /** Mon niveau courant. `null` si jamais notée. */
  rating: number | null;
  /** Meilleur niveau atteint, courant compris. */
  peak: number | null;
  /** Variation sur la fenêtre affichée. `null` sous deux mesures. */
  delta: number | null;
  /** Série chronologique, plafonnée (sparkline de la stat tile). */
  series: RatingPoint[];
  /** Affrontements notés qui alimentent la série. */
  ratedGames: number;
  milestones: Milestone[];
};
