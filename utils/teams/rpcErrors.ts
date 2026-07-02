// utils/teams/rpcErrors.ts
//
// Traduction centralisee des erreurs remontees par les fonctions RPC
// transactionnelles du flow equipe (approve_join_request,
// approve_transfer_request, accept_invitation).
//
// Chaque fonction est atomique (verrou FOR UPDATE + CAS status pending->approved
// + mutation roster) et signale ses erreurs metier via :
//   - error.code   : contraintes Postgres (23505 unique, 23514 check/trigger)
//   - error.message: sentinelles applicatives (RAISE EXCEPTION 'demande_not_found'…)
//
// On teste `error.code` D'ABORD (contraintes DB natives), puis `error.message`
// (sentinelles metier). Renvoie un couple { status, error } pret a serialiser.

export type MappedRpcError = { status: number; error: string };

/**
 * Mappe une erreur PostgREST/Postgres remontee par une des RPC du flow equipe
 * vers un statut HTTP + message metier.
 *
 * Table de correspondance (cf. contrat RPC) :
 *   - 23505 (unique_violation)  -> 409  deja dans une equipe
 *   - 23514 (check_violation)   -> 400  max_players depasse (trigger)
 *   - message contient :
 *       demande_not_found       -> 404
 *       demande_wrong_type      -> 400
 *       demande_not_pending     -> 409
 *       demande_no_team         -> 409
 *       not_owner               -> 403
 *   - defaut                    -> 500
 */
export function mapTeamRpcError(error: {
  code?: string | null;
  message?: string | null;
}): MappedRpcError {
  const code = error?.code ?? '';
  const message = error?.message ?? '';

  // 1) Contraintes Postgres natives (prioritaires).
  if (code === '23505') {
    return { status: 409, error: 'Ce joueur est déjà dans une équipe.' };
  }
  if (code === '23514') {
    return {
      status: 400,
      error:
        "L'équipe a atteint la limite de joueur(s) imposée par un tournoi.",
    };
  }

  // 2) Sentinelles metier levees par les fonctions PL/pgSQL.
  if (message.includes('demande_not_found')) {
    return { status: 404, error: 'Demande introuvable ou déjà traitée.' };
  }
  if (message.includes('demande_wrong_type')) {
    return { status: 400, error: 'Type de demande invalide.' };
  }
  if (message.includes('demande_not_pending')) {
    return { status: 409, error: 'Cette demande a déjà été traitée.' };
  }
  if (message.includes('demande_no_team')) {
    return {
      status: 409,
      error: "L'équipe associée à cette demande n'existe plus.",
    };
  }
  if (message.includes('not_owner')) {
    return {
      status: 403,
      error: "Tu n'es pas autorisé à traiter cette demande.",
    };
  }

  return { status: 500, error: 'Échec du traitement de la demande.' };
}
