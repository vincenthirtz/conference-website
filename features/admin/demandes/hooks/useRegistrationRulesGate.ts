// features/admin/demandes/hooks/useRegistrationRulesGate.ts — le règlement à
// valider, vu d'une demande d'inscription (`team_registration`) : l'équipe
// a-t-elle toutes ses validations ? Sinon « Approuver » est désactivé, avec la
// raison.
//
// Les lectures sont celles du tournoi (même cache que l'édition et le hub,
// une requête par tournoi même pour une liste de vingt demandes). Elles
// échouent en silence — un caster n'a pas `manage_tournaments` : le bouton
// reste alors tel quel et c'est le refus 409 du serveur qui parlera.

import { useTournamentRulesOverview } from '@/features/admin/tournaments/hooks/useTournamentRules';
import {
  rulesBlockMessage,
  rulesGateFor,
  rulesGateReason,
  type RulesGate,
} from '@/features/admin/tournaments/rulesGate';
import type { TournamentRulesTeamStatus } from '@/features/admin/tournaments/client';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTournamentRules from '@/lib/i18n/locales/admin-fr/adminTournamentRules';

/** Id de la raison écrite sous « Approuver » (aria-describedby). */
export const APPROVE_RULES_REASON_ID = 'approve-rules-reason';

export type RegistrationRulesGate = {
  gate: RulesGate;
  required: boolean;
  /** Décompte de l'équipe, s'il est connu. */
  team: TournamentRulesTeamStatus | null;
  noVersion: boolean;
  refetch: () => void;
};

export function useRegistrationRulesGate(
  tournamentId: string | null | undefined,
  teamId: string | null | undefined
): RegistrationRulesGate {
  const { versions, status, required } = useTournamentRulesOverview(
    tournamentId,
    !!tournamentId
  );
  const gate = rulesGateFor(versions.data, status.data, teamId);
  const team = status.data?.teams.find((x) => x.teamId === teamId) ?? null;
  return {
    gate,
    required,
    team,
    noVersion: required && (versions.data?.versions.length ?? 0) === 0,
    refetch: () => {
      void versions.refetch();
      if (required) void status.refetch();
    },
  };
}

export type RegistrationApproval = {
  /** Pourquoi « Approuver » est désactivé ; `null` = rien ne bloque. */
  reason: string | null;
  /** `aria-describedby` du bouton quand il est bloqué. */
  describedBy: string | undefined;
  /** Message du refus 409 `rules_not_accepted` (et décompte relu), sinon null. */
  errorText: (err: unknown) => string | null;
};

/**
 * La fiche d'une demande : « Approuver » est-il bloqué par le règlement ?
 * Toute demande qui n'est pas une inscription passe (`reason: null`).
 */
export function useRegistrationApproval(
  demande:
    | { type?: unknown; tournament_id?: unknown; team_id?: unknown }
    | null
    | undefined
): RegistrationApproval {
  const t = useAdminT(nsAdminTournamentRules);
  const isRegistration = demande?.type === 'team_registration';
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const gate = useRegistrationRulesGate(
    isRegistration ? str(demande?.tournament_id) : null,
    str(demande?.team_id)
  );
  const reason = isRegistration ? rulesGateReason(gate.gate, t) : null;
  return {
    reason,
    describedBy: reason ? APPROVE_RULES_REASON_ID : undefined,
    errorText: (err) => {
      const msg = rulesBlockMessage(err, t);
      if (msg) gate.refetch();
      return msg;
    },
  };
}
