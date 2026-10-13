// features/player/demandes/model.ts — formes de réponse lues par l'UI du site
// (carte « Inscription au tournoi »). Types seuls, sans import de service : le
// site les reçoit par la synchro inversée sans tirer le métier ni les
// repositories derrière (`service/registerTeam.ts` les réexporte).

import type { RegistrationField } from '@/utils/registrationFields';

export type TeamRegistrationBlocker =
  /** Aucun tournoi en cours dans ce tenant. */
  | 'no_tournament'
  /** Le tournoi existe mais ses inscriptions ne sont pas ouvertes. */
  | 'not_open'
  /** L'équipe y est déjà inscrite. */
  | 'already_registered'
  /** Une candidature attend déjà la validation du staff. */
  | 'pending_request'
  /** Le tournoi a atteint `max_teams`. */
  | 'tournament_full'
  /** Le rôle de l'appelant ne couvre pas `register_tournaments`. */
  | 'no_permission';

/**
 * Photo de l'inscription de l'équipe au tournoi en cours.
 *
 * Elle existe parce que le chemin d'inscription automatique
 * (`/api/teams/create-with-member`) est BEST-EFFORT : il crée l'équipe même
 * quand l'inscription échoue, et le wizard renvoie alors la capitaine vers son
 * espace équipe pour « réessayer ».
 */
export type TeamRegistrationStatus = {
  team: { id: string; name: string } | null;
  tournament: { id: string; name: string } | null;
  /** Inscription confirmée (`tournament_teams`). */
  registered: boolean;
  /** Candidature en attente de validation, quel qu'en soit l'auteur. */
  pendingDemandeId: string | null;
  /** Dernière candidature TRAITÉE de l'équipe (approuvée / refusée). */
  lastDemande: { id: string; status: string; created_at: string } | null;
  canSubmit: boolean;
  blockers: TeamRegistrationBlocker[];
  /**
   * Membres manquants pour atteindre `min_players`, 0 si le roster est complet.
   * AVERTISSEMENT, PAS BLOCAGE (décision produit 2026-08-27) : `min_players`
   * gouverne l'inscription automatique directe, les relances et la décision
   * du staff, pas le dépôt de la candidature.
   */
  rosterShortfall: number;
  minPlayers: number | null;
  /** Effectif compté comme le fait le POST — cf. `countRegistrationMembers`. */
  playerCount: number;
  maxTeams: number | null;
  registeredTeams: number;
  /** Champs d'inscription personnalisés à remplir avant de candidater. */
  fields: RegistrationField[];
};
