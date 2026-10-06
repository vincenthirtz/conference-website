// features/admin/_shared/queue/AssignmentControl.tsx — « Je prends » / « Libérer »
// d'un dossier de file de traitement (demande, ticket support), avec le nom de
// la personne qui l'a pris. Présentationnel : l'appel est fait par l'appelant.
//
// Libre → bouton « Je prends ». Pris → « Pris par X » + « Libérer » (ouvert à
// tout le staff de la file : un dossier oublié doit pouvoir être rendu ; le
// journal garde qui l'avait).

import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

export type AssignmentLabels = {
  claim: string;
  release: string;
  /** `{name}` = personne assignée. */
  assignedTo: string;
  unknownStaff: string;
};

export function assigneeName(
  assignedTo: { display_name: string | null } | null | undefined,
  labels: Pick<AssignmentLabels, 'unknownStaff'>
): string {
  return assignedTo?.display_name || labels.unknownStaff;
}

export default function AssignmentControl({
  assignedStaffId,
  assignedTo,
  busy,
  labels,
  onClaim,
  onRelease,
}: {
  assignedStaffId: string | null | undefined;
  assignedTo: { display_name: string | null } | null | undefined;
  busy: boolean;
  labels: AssignmentLabels;
  onClaim: () => void;
  onRelease: () => void;
}) {
  if (!assignedStaffId) {
    return (
      <AdminButton
        variant="secondary"
        size="xs"
        onClick={onClaim}
        disabled={busy}
        data-testid="assign-claim"
      >
        {labels.claim}
      </AdminButton>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Chip tone="brand" data-testid="assigned-to">
        {labels.assignedTo.replace('{name}', assigneeName(assignedTo, labels))}
      </Chip>
      <AdminButton
        variant="ghost"
        size="xs"
        onClick={onRelease}
        disabled={busy}
        data-testid="assign-release"
      >
        {labels.release}
      </AdminButton>
    </span>
  );
}
