// utils/matches/lineup.ts
//
// Feuille de match — cœur PUR : quand la feuille s'ouvre, qui peut y figurer,
// et ce qui fait une composition valide.
//
// Le problème d'origine : « qui a joué ce match ? » n'avait pas de réponse.
// `snapshotMatchParticipants` (utils/rating/applyMatchRating.ts) figeait le
// ROSTER COURANT au moment de la saisie du score — son commentaire parle
// d'« approximation assumée ». Une remplaçante restée sur le banc recevait donc
// le même ajustement de rating qu'une titulaire, et une joueuse arrivée APRÈS
// le match se voyait attribuer un match qu'elle n'a pas joué.
//
// Ce module ne touche ni à Supabase ni à React : les règles sont écrites une
// fois et testées (tests/unit/matchLineup.test.ts). Les routes s'en servent
// pour répondre, l'UI pour griser un bouton — sans que l'une puisse dériver de
// l'autre.

import { MAX_TEAM_PLAYERS } from '@/utils/constants';
import { isNonPlayingTeamRole } from '@/utils/teams/roleKind';

/** Côté du match occupé par une équipe. `null` = elle n'y participe pas. */
export type MatchSlot = 1 | 2 | null;

export type LineupStatus = 'draft' | 'validated';

/** Qui a engagé sa responsabilité en validant. */
export type LineupValidatorKind = 'team' | 'admin';

/** Le strict nécessaire d'un match pour raisonner sur la feuille. */
export type LineupMatchLike = {
  id: string;
  status?: string | null;
  team1_id?: string | null;
  team2_id?: string | null;
  team1_checked_in_at?: string | null;
  team2_checked_in_at?: string | null;
};

/** Le strict nécessaire d'un membre du roster. */
export type LineupMemberLike = {
  user_id?: string | null;
  role?: string | null;
};

/** Pourquoi la feuille n'est pas ouverte — chaque cas appelle un autre message. */
export type LineupClosedReason =
  /** L'équipe ne joue pas ce match. */
  | 'not_in_match'
  /** Le match est terminé (ou annulé) : plus rien à composer. */
  | 'match_over'
  /** L'équipe n'a pas encore fait son check-in. */
  | 'awaiting_checkin';

export type LineupOpenState =
  | { open: true; slot: 1 | 2 }
  | { open: false; reason: LineupClosedReason; slot: MatchSlot };

/** Le côté qu'occupe `teamId`, ou `null`. */
export function teamSlot(match: LineupMatchLike, teamId: string): MatchSlot {
  if (match.team1_id && match.team1_id === teamId) return 1;
  if (match.team2_id && match.team2_id === teamId) return 2;
  return null;
}

/** `true` si l'équipe a fait son check-in sur ce match. */
export function hasCheckedIn(match: LineupMatchLike, teamId: string): boolean {
  const slot = teamSlot(match, teamId);
  if (slot === 1) return !!match.team1_checked_in_at;
  if (slot === 2) return !!match.team2_checked_in_at;
  return false;
}

/** Statuts de match sur lesquels composer n'a plus de sens. */
const CLOSED_MATCH_STATUSES = new Set(['completed', 'cancelled', 'forfeit']);

/**
 * La feuille est-elle ouverte pour cette équipe ?
 *
 * L'ordre des refus est celui de l'utilité : « tu ne joues pas ce match »
 * prime sur « le match est fini », qui prime sur « fais ton check-in ». Dire
 * « fais ton check-in » à une équipe qui n'est pas sur le match l'enverrait
 * chercher un bouton qui n'existe pas.
 *
 * Le CHECK-IN est la porte, et c'est délibéré : composer avant d'avoir
 * confirmé sa présence n'engage à rien, et la feuille se remplirait de
 * brouillons d'équipes qui ne se présenteront pas.
 */
export function lineupOpenState(
  match: LineupMatchLike,
  teamId: string
): LineupOpenState {
  const slot = teamSlot(match, teamId);
  if (slot === null) return { open: false, reason: 'not_in_match', slot };
  if (CLOSED_MATCH_STATUSES.has((match.status ?? '').trim().toLowerCase())) {
    return { open: false, reason: 'match_over', slot };
  }
  if (!hasCheckedIn(match, teamId)) {
    return { open: false, reason: 'awaiting_checkin', slot };
  }
  return { open: true, slot };
}

/**
 * Les membres ÉLIGIBLES à figurer sur la feuille : le roster jouant.
 *
 * L'encadrement en est exclu — un coach n'entre pas en jeu, et l'inscrire
 * fausserait aussi bien le rating que le décompte d'effectif. C'est la même
 * définition que `countPlayingMembers`, volontairement : deux définitions de
 * « qui joue » finiraient par diverger.
 */
export function eligibleForLineup<T extends LineupMemberLike>(
  members: readonly T[]
): T[] {
  return members.filter((m) => !!m.user_id && !isNonPlayingTeamRole(m.role));
}

export type LineupValidationError =
  /** Aucune joueuse alignée. */
  | 'empty'
  /** Plus d'alignées que ce qu'une équipe peut poser sur le terrain. */
  | 'too_many'
  /** Une id qui n'appartient pas au roster jouant de l'équipe. */
  | 'not_eligible'
  /** La même personne deux fois. */
  | 'duplicate';

export type LineupValidation =
  | { ok: true; starters: string[] }
  | { ok: false; error: LineupValidationError; offending?: string[] };

/**
 * Valide une composition proposée.
 *
 * `maxStarters` est un paramètre plutôt qu'une constante en dur : la taille
 * d'une line-up dépend du jeu (5 en Overwatch), et le registre des jeux la
 * porte déjà. On garde MAX_TEAM_PLAYERS en défaut pour rester identique à
 * l'existant tant qu'aucun appelant ne la passe.
 *
 * On refuse les doublons AVANT de compter : sans ça, cinq fois la même
 * personne passerait pour une équipe complète.
 */
export function validateLineup(
  proposed: readonly string[],
  eligibleUserIds: readonly string[],
  maxStarters: number = MAX_TEAM_PLAYERS
): LineupValidation {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of proposed) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  if (duplicates.length > 0) {
    return {
      ok: false,
      error: 'duplicate',
      offending: [...new Set(duplicates)],
    };
  }

  const eligible = new Set(eligibleUserIds);
  const strangers = [...seen].filter((id) => !eligible.has(id));
  if (strangers.length > 0) {
    return { ok: false, error: 'not_eligible', offending: strangers };
  }

  if (seen.size === 0) return { ok: false, error: 'empty' };
  if (seen.size > maxStarters) return { ok: false, error: 'too_many' };

  return { ok: true, starters: [...seen] };
}

/**
 * Une feuille validée est-elle FIGÉE ?
 *
 * Oui : c'est tout l'intérêt. Une composition qu'on peut réécrire après le
 * match ne prouve rien, et le rating comme les litiges s'appuient dessus. Seul
 * un admin peut rouvrir (`allowAdminOverride`) — le jour du tournoi, une
 * erreur de saisie ne doit pas être définitive.
 */
export function canEditLineup(
  status: LineupStatus,
  { isAdmin = false }: { isAdmin?: boolean } = {}
): boolean {
  if (status !== 'validated') return true;
  return isAdmin;
}
