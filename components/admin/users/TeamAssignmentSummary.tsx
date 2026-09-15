// Récapitulatif du rattachement à une équipe après création d'un compte
// (/admin/users/new). Extrait de la page (lot A7, cf. adminFileSizeGuard).
//
// L'ajout staff crée une INVITATION par défaut (cf.
// utils/teams/staffInvitation.ts) : le récapitulatif distingue « ajoutée » de
// « invitée », et expose le lien privé quand l'email n'est pas parti — il n'est
// rendu qu'une fois par l'API.

import { useAdminT } from '@/lib/i18n/useAdminT';
import type { TeamRole } from '@/utils/teamRoles';
import nsAdminUsersNew from '@/lib/i18n/locales/admin-fr/adminUsersNew';

export type AddMemberResponse = {
  teamMemberId?: string;
  teamId: string;
  userId: string;
  role: string;
  captainSet: boolean;
  info?: string;
  /**
   * Ajout staff = invitation par défaut (cf. utils/teams/staffInvitation.ts) :
   * la personne rejoint l'équipe quand elle accepte.
   */
  invited?: boolean;
  inviteUrl?: string;
  emailSent?: boolean;
};

type Props = {
  assignment: AddMemberResponse;
  teamName: string | null | undefined;
  teamRoles: TeamRole[];
};

export default function TeamAssignmentSummary({
  assignment,
  teamName,
  teamRoles,
}: Props) {
  const t = useAdminT(nsAdminUsersNew);
  return (
    <div className="mt-3 pt-3 border-t border-emerald-500/30">
      <p className="font-medium text-emerald-300 mb-1">
        {assignment.invited ? t.teamInvitedTitle : t.teamAssignedTitle}
      </p>
      {assignment.invited && (
        <p className="text-sm text-neutral-300 mb-1">{t.teamInvitedHint}</p>
      )}
      {assignment.invited && !assignment.emailSent && assignment.inviteUrl && (
        <p className="text-sm text-amber-300 mb-1 break-all">
          {t.teamInvitedNoEmail} <code>{assignment.inviteUrl}</code>
        </p>
      )}
      <div className="text-sm text-neutral-300 space-y-1">
        <p>
          {t.teamLabel}{' '}
          <span className="text-white">{teamName || assignment.teamId}</span>
        </p>
        <p>
          {t.roleLabelColon}{' '}
          <span className="text-white">
            {teamRoles.find((r) => r.value === assignment.role)?.label ??
              assignment.role}
          </span>
        </p>
        {assignment.captainSet && (
          <p className="text-amber-300">{t.setCaptainSuccess}</p>
        )}
      </div>
    </div>
  );
}
