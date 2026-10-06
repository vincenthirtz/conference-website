// features/player/dashboard/schemas.ts — formes du tableau de bord joueuse
// (GET /api/player/dashboard, lot P12). Types seuls (+ deux constantes) :
// lus par l'écran et le service, jamais validés (lecture sans corps).

import type { ManagedTeamSummary } from '@/utils/teams/managedTeamSlice';
import type { TeamPermission } from '@/utils/teamRoles';

export type DashboardTeamRow = {
  id: string;
  slug: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  description: string | null;
  is_joinable?: boolean;
  open_for_scrim?: boolean;
};

export type DashboardMemberRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  battle_tag: string | null;
  battle_tag_verified_at?: string | null;
  specialty: string | null;
  /** SR Overwatch déclaré (cf. utils/overwatchRank.ts), `null` si non renseigné. */
  skill_rating: number | null;
  is_substitute: boolean;
  captain?: boolean | null;
  is_captain?: boolean | null;
};

export type Demande = Record<string, unknown>;

export type PendingScrim = {
  id: string;
  user_id: string | null;
  source: string | null;
  status: string;
  comment: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  user: {
    id: string | null;
    email: string | null;
    display_name: string | null;
    discord: string | null;
  } | null;
  /** Negotiation contract (cf. utils/teams/scrimNegotiation.ts). */
  scrimNego: {
    slots: string[];
    proposedBy: string | null;
    rounds: number;
    agreedSlot: string | null;
  };
  /** true when my team is the requester (payload.from_team_id). */
  iAmRequester: boolean;
  myTeamId: string;
};

export type NextMatchSection = {
  match: {
    id: string;
    scheduledAt: string | null;
    status: string;
    format: string | null;
    roundName: string | null;
    streamUrl: string | null;
    bestOf: number | null;
  } | null;
  team: { id: string; name: string; slot: 1 | 2 } | null;
  opponent: { id: string; name: string } | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  checkin: {
    /** `null` pour qui ne peut pas pointer (cf. `canCheckIn`). */
    token: string | null;
    /** Capitaine, coach ou manager (utils/teams/canCheckIn.ts). */
    canCheckIn: boolean;
    alreadyCheckedIn: boolean;
    checkedInAt: string | null;
    opensAt: string | null;
    closesAt: string | null;
    isOpen: boolean;
    isPassed: boolean;
  } | null;
  /**
   * Match-readiness metadata derived from the tournament min_players and the
   * current roster size. `shortfall` > 0 means the team is under the minimum.
   */
  readiness: {
    minPlayers: number | null;
    rosterSize: number;
    shortfall: number;
  } | null;
};

/**
 * Une chose À FAIRE, calculée serveur (lot J6 de docs/PLAN-espace-joueur.md).
 *
 * Le dashboard empile une quinzaine de cartes ; quand elles parlent toutes, la
 * hiérarchie est celle du code, pas celle de l'urgence — une capitaine à J-1
 * doit descendre pour trouver son check-in. Ce bandeau remonte les gestes en
 * attente, plafonné à trois : au-delà, ce n'est plus une liste d'actions mais
 * une deuxième page.
 *
 * Règle : AUCUNE nouvelle règle métier ici. Chaque item est dérivé d'une
 * donnée que le payload contient déjà (ou d'une lecture que la carte
 * correspondante faisait de son côté).
 */
export type TodoItem = {
  /** Identifiant stable — l'ordre et le rendu ne doivent pas sautiller. */
  id:
    | 'checkin'
    | 'lineup'
    | 'scrims'
    | 'messages'
    | 'invitation'
    | 'score'
    | 'joinRequests'
    | 'battletag'
    | 'roster';
  /** Chemin interne à ouvrir. */
  href: string;
  /** Compteur associé (messages non lus, scrims en attente…), sinon `null`. */
  count: number | null;
};

export type PlayerDashboardPayload = {
  team: DashboardTeamRow | null;
  members: DashboardMemberRow[];
  isCaptain: boolean;
  isManager: boolean;
  /**
   * Permissions EFFECTIVES sur `team` — la MÊME liste que celle appliquée par
   * les routes d'écriture. Le client s'en sert pour ne proposer que les gestes
   * qui aboutiront : `isCaptain` / `isManager` seuls faisaient afficher au
   * coach des actions que le serveur lui refusait ensuite.
   */
  permissions: TeamPermission[];
  /**
   * Toutes les équipes gérées, `team` comprise (un manager peut en encadrer
   * plusieurs). Vide pour une joueuse sans droits de gestion.
   */
  managedTeams: ManagedTeamSummary[];
  /**
   * Les trois gestes les plus urgents, dans un ordre STABLE (défini par le
   * serveur). Vide = rien à faire, et l'écran ne rend alors aucun bandeau.
   */
  todo: TodoItem[];
  demandesCaptain: Demande[];
  demandesJoin: Demande[];
  pendingScrims: PendingScrim[];
  unreadMessages: number;
  nextMatch: NextMatchSection;
};

export const EMPTY_NEXT_MATCH: NextMatchSection = {
  match: null,
  team: null,
  opponent: null,
  tournament: null,
  checkin: null,
  readiness: null,
};

/**
 * Plafond de l'historique des demandes. Une demande en cours est par nature
 * récente : les cinquante dernières la contiennent toujours. Sans plafond, la
 * lecture grossissait avec l'ancienneté du compte.
 */
export const DEMANDES_HISTORY_LIMIT = 50;
