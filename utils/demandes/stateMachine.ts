// utils/demandes/stateMachine.ts
//
// State machine centralisée pour les transitions de status des demandes
// (join, transfer, scrim, etc. — toutes partagent la même table `demandes`).
//
// Sans ce gate, un admin peut :
//   - cancel une demande déjà approved (qui a déjà créé son side-effect :
//     team_member ajouté, scrim créé, etc.) → l'effet reste, mais la demande
//     apparaît cancelled dans la liste, ce qui est trompeur.
//   - approve deux fois la même demande (double-clic, race admin/auto-process)
//     → le side-effect peut se dupliquer si pas idempotent côté handler.
//   - re-rejeter une demande déjà rejected.
//
// Transitions autorisées :
//   pending    → pending | approved | rejected | cancelled  (initial → tout)
//   approved   → approved (no-op) | pending (reset admin)
//   rejected   → rejected (no-op) | pending (reset admin)
//   cancelled  → cancelled (no-op) | pending (reset admin)
//
// Le "reset admin" (terminal → pending) est conservé car certaines UI
// admin peuvent en avoir besoin pour rouvrir une demande. À refuser plus
// strictement si on veut une politique "terminal = immuable" plus tard.

import type { DemandeStatus } from '../../pages/api/admin/demandes';

const ALLOWED_TRANSITIONS: Record<DemandeStatus, DemandeStatus[]> = {
  pending: ['pending', 'approved', 'rejected', 'cancelled'],
  approved: ['approved', 'pending'],
  rejected: ['rejected', 'pending'],
  cancelled: ['cancelled', 'pending'],
};

export type DemandeTransitionResult =
  | { ok: true }
  | { ok: false; error: string; code: 'INVALID_DEMANDE_TRANSITION' };

/**
 * Valide qu'une transition `from → to` est autorisée. Renvoie un objet
 * discriminé pour usage `if (result.ok)`. `from === to` est toujours
 * autorisé (idempotence).
 */
export function validateDemandeTransition(
  from: DemandeStatus,
  to: DemandeStatus
): DemandeTransitionResult {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) {
    return {
      ok: false,
      error: `Statut source inconnu : ${from}.`,
      code: 'INVALID_DEMANDE_TRANSITION',
    };
  }
  if (allowed.includes(to)) return { ok: true };
  return {
    ok: false,
    error: `Transition interdite : ${from} → ${to}. Réinitialisez la demande en "pending" si vous voulez réappliquer un statut terminal.`,
    code: 'INVALID_DEMANDE_TRANSITION',
  };
}

/**
 * Variante batch : retourne la liste des transitions invalides parmi un
 * lot { id, fromStatus } → toStatus. Si le tableau est vide, toutes les
 * transitions sont valides.
 */
export function validateDemandeBatchTransitions(
  items: { id: string; fromStatus: DemandeStatus }[],
  to: DemandeStatus
): { id: string; fromStatus: DemandeStatus; error: string }[] {
  const invalid: { id: string; fromStatus: DemandeStatus; error: string }[] =
    [];
  for (const item of items) {
    const result = validateDemandeTransition(item.fromStatus, to);
    if (!result.ok) {
      invalid.push({
        id: item.id,
        fromStatus: item.fromStatus,
        error: result.error,
      });
    }
  }
  return invalid;
}
