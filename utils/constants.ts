// utils/constants.ts
// Centralized enums and constants used across API routes and components.
// Import from here instead of redefining locally.

import type {
  MatchStatus,
  BracketSide,
  StageType,
  TournamentStatus,
} from '@/types/admin';

export const VALID_TOURNAMENT_STATUSES: TournamentStatus[] = [
  'draft',
  'published',
  'running',
  'completed',
  'archived',
];

export const VALID_MATCH_STATUSES: MatchStatus[] = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
];

export const VALID_BRACKET_SIDES: BracketSide[] = ['wb', 'lb', 'final', 'none'];

export const VALID_STAGE_TYPES: StageType[] = [
  'group',
  'bracket',
  'swiss',
  'round_robin',
  'showmatch',
  'other',
];

/**
 * Taille maximale d'un roster d'équipe (joueurs titulaires).
 * Utilisé côté API pour exclure les équipes pleines de la liste « rejoindre »
 * (`/api/teams?joinable=1`) et côté front comme repère d'affichage (`x/5`).
 * Source de vérité produit : 5 joueurs par équipe Overwatch.
 */
export const MAX_TEAM_PLAYERS = 5;

/**
 * Plafond ABSOLU de lignes de roster acceptées en une création d'équipe,
 * encadrement compris.
 *
 * Distinct de MAX_TEAM_PLAYERS, et volontairement plus large : coach et manager
 * ne consomment aucune place de roster (cf. `countPlayingMembers` et le trigger
 * `enforce_team_max_players`), une équipe complète peut donc légitimement
 * déclarer du staff en plus de ses 5 joueuses.
 *
 * Ce plafond-ci n'est pas une règle de jeu mais un garde-fou anti-abus :
 * /api/teams/create-with-member est PUBLIC et crée un compte auth par email
 * reçu. Partagé avec le wizard (pages/team/create.tsx) pour que le client
 * n'autorise jamais une saisie que le serveur refusera.
 */
export const MAX_ROSTER_ROWS = 10;

export const VALID_PARTNERSHIP_STATUSES = [
  'new',
  'read',
  'contacted',
  'negotiating',
  'accepted',
  'declined',
  'archived',
] as const;
