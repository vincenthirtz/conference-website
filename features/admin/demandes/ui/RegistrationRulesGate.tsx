// features/admin/demandes/ui/RegistrationRulesGate.tsx — le règlement à
// valider dans les demandes d'inscription (`team_registration`) :
//
//   - RegistrationRulesPanel : sur la fiche, « Règlement : 5/7 » et le nom
//     des membres qui manquent (ou « Déposez le règlement ») ;
//   - RegistrationRulesChip : la pastille « Règlement X/Y » d'une ligne de la
//     liste ;
//   - RulesGatedApproveButton : l'approbation rapide de la liste, désactivée
//     avec sa raison (info-bulle + texte lu) tant qu'une validation manque ;
//   - Panel / Reason : les mêmes, en noms courts pour la fiche demande
//     (`import * as RulesGate`), dont l'écran est gelé en taille.
//
// Rien ne s'affiche quand le tournoi ne demande pas de validation. Les
// lectures passent par useRegistrationRulesGate (cache du tournoi).

import type { ReactNode } from 'react';
import {
  Button,
  Chip,
  FicheSection,
  rubanMuted,
  rubanOk,
  rubanWarn,
} from '@/features/ruban';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTournamentRules from '@/lib/i18n/locales/admin-fr/adminTournamentRules';
import {
  missingMemberNames,
  rulesGateReason,
} from '@/features/admin/tournaments/rulesGate';
import {
  APPROVE_RULES_REASON_ID,
  useRegistrationRulesGate,
} from '../hooks/useRegistrationRulesGate';

/** Fiche demande : le panneau, pour une demande d'inscription seulement. */
export function Panel({
  demande,
}: {
  demande: { type?: unknown; tournament_id?: unknown; team_id?: unknown };
}) {
  if (
    demande.type !== 'team_registration' ||
    typeof demande.tournament_id !== 'string' ||
    !demande.tournament_id
  )
    return null;
  return (
    <RegistrationRulesPanel
      tournamentId={demande.tournament_id}
      teamId={typeof demande.team_id === 'string' ? demande.team_id : null}
    />
  );
}

/** Fiche demande : la raison du blocage, sous « Approuver ». */
export function Reason({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <p
      id={APPROVE_RULES_REASON_ID}
      className="basis-full text-sm text-[#ffd9a3]"
    >
      {reason}
    </p>
  );
}

export function RegistrationRulesPanel({
  tournamentId,
  teamId,
}: {
  tournamentId: string;
  teamId: string | null;
}) {
  const t = useAdminT(nsAdminTournamentRules);
  const { gate, required, team, noVersion } = useRegistrationRulesGate(
    tournamentId,
    teamId
  );
  if (!required) return null;

  const missing = team ? missingMemberNames(team) : [];
  return (
    <FicheSection title={t.gateTitle}>
      <div data-testid="registration-rules-panel" className="space-y-2 text-sm">
        {noVersion && (
          <p role="alert" className={`${rubanWarn} px-3 py-2`}>
            {t.gateNoVersion}
          </p>
        )}
        {team && (
          <p className={`${team.complete ? rubanOk : rubanWarn} px-3 py-2`}>
            {team.complete
              ? format(t.gateComplete, {
                  validated: team.validated,
                  total: team.total,
                })
              : rulesGateReason(gate, t)}
          </p>
        )}
        {missing.length > 0 && (
          <p className={rubanMuted}>
            {format(t.gateMissing, { names: missing.join(', ') })}
          </p>
        )}
      </div>
    </FicheSection>
  );
}

export function RegistrationRulesChip({
  tournamentId,
  teamId,
}: {
  tournamentId: string;
  teamId: string | null;
}) {
  const t = useAdminT(nsAdminTournamentRules);
  const { required, team, noVersion } = useRegistrationRulesGate(
    tournamentId,
    teamId
  );
  if (!required) return null;
  if (noVersion) return <Chip tone="warn">{t.chipNoVersion}</Chip>;
  if (!team) return null;
  const names = missingMemberNames(team);
  return (
    <Chip
      tone={team.complete ? 'ok' : 'warn'}
      title={
        team.complete
          ? t.chipTitleComplete
          : format(t.chipTitleIncomplete, { names: names.join(', ') })
      }
      data-testid="registration-rules-chip"
    >
      {format(t.chipLabel, { validated: team.validated, total: team.total })}
    </Chip>
  );
}

/** « Approuver » d'une ligne d'inscription, bloqué par le règlement. */
export function RulesGatedApproveButton({
  tournamentId,
  teamId,
  disabled,
  onApprove,
  title,
  children,
}: {
  tournamentId: string;
  teamId: string | null;
  disabled: boolean;
  onApprove: () => void;
  title: string;
  children: ReactNode;
}) {
  const t = useAdminT(nsAdminTournamentRules);
  const { gate } = useRegistrationRulesGate(tournamentId, teamId);
  const reason = rulesGateReason(gate, t);
  return (
    <Button
      variant="secondary"
      size="xs"
      onClick={onApprove}
      disabled={disabled || gate.blocked}
      title={reason ?? title}
      aria-label={reason ? `${title} — ${reason}` : undefined}
    >
      {children}
    </Button>
  );
}
