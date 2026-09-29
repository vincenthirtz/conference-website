// features/admin/users/ui/CreateUserBlocks.tsx — les blocs de lecture de
// l'écran « Nouvel utilisateur » (pages/admin/users/new.tsx), passés en
// « Le Ruban » : le compte-rendu de création et l'encart d'information.
// Purement présentationnel : la page garde l'état, les appels réseau et les
// rattrapages (renvoi des identifiants), elle ne passe ici que des valeurs et
// des callbacks.

import Link from 'next/link';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminUsersNew from '@/lib/i18n/locales/admin-fr/adminUsersNew';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';
import TeamAssignmentSummary, {
  type AddMemberResponse,
} from '@/components/admin/users/TeamAssignmentSummary';
import type { TeamRole } from '@/utils/teamRoles';

const CODE =
  'rounded-[3px] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-xs text-[var(--t1,#f4edf7)]';
const LINK =
  'text-[var(--or-200,#eec4ff)] underline underline-offset-2 hover:text-[var(--t1,#f4edf7)]';

export function CreateUserSuccess({
  user,
  teamAssignment,
  teamName,
  teamRoles,
  staffRoleLabel,
  resending,
  onResend,
  onCreateAnother,
}: {
  user: { userId: string; email: string; passwordSentByEmail?: boolean };
  teamAssignment?: AddMemberResponse;
  teamName?: string;
  teamRoles: TeamRole[];
  /** Libellé du rôle staff accordé par l'API, sinon null. */
  staffRoleLabel: string | null;
  resending: boolean;
  onResend: () => void;
  onCreateAnother: () => void;
}) {
  const t = useAdminT(nsAdminUsersNew);
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.06)] px-5 py-4"
    >
      <div className="flex-1 space-y-3">
        <p className="font-semibold text-[var(--lf-200,#b3e7a3)]">
          {t.successTitle}
        </p>
        <div className="space-y-1 text-sm text-[var(--t2,#c7bfca)]">
          <p>
            {t.userIdLabel} <span className={CODE}>{user.userId}</span>
          </p>
          <p>
            {t.emailLabel} <span className={CODE}>{user.email}</span>
          </p>
          {user.passwordSentByEmail ? (
            <p className="text-xs text-[var(--lf-200,#b3e7a3)]">
              {t.passwordSentByEmail}
            </p>
          ) : (
            <div className="rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.06)] px-3 py-2">
              <p className="text-xs text-[#ffd9a3]">{t.emailNotSent}</p>
              <AdminButton
                size="xs"
                className="mt-2"
                onClick={onResend}
                disabled={resending}
              >
                {resending ? t.resending : t.resendCredentials}
              </AdminButton>
            </div>
          )}
          {staffRoleLabel ? (
            <p className="text-xs text-[var(--or-200,#eec4ff)]">
              {format(t.staffAccessGranted, { role: staffRoleLabel })}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href={`/admin/users/${user.userId}/player-view`}
            className={LINK}
          >
            {t.openUserSpace}
          </Link>
          {teamAssignment && (
            <Link
              href={`/admin/teams/${teamAssignment.teamId}`}
              className={LINK}
            >
              {t.openTeam}
            </Link>
          )}
        </div>

        {teamAssignment && (
          <TeamAssignmentSummary
            assignment={teamAssignment}
            teamName={teamName}
            teamRoles={teamRoles}
          />
        )}

        <AdminButton size="sm" variant="secondary" onClick={onCreateAnother}>
          {t.createAnother}
        </AdminButton>
      </div>
    </div>
  );
}

function InfoItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lf,#7fca65)]"
      />
      {children}
    </li>
  );
}

/** Colonne de droite : ce que fait la création, et le rattachement équipe. */
export function CreateUserInfoAside({
  assignToTeam,
}: {
  assignToTeam: boolean;
}) {
  const t = useAdminT(nsAdminUsersNew);
  return (
    <FicheSection eyebrow title={t.infoTitle}>
      <ul className="space-y-3 text-sm text-[var(--t2,#c7bfca)]">
        <InfoItem>{t.infoServiceRole}</InfoItem>
        <InfoItem>{t.infoEmailConfirmed}</InfoItem>
        <InfoItem>{t.infoPasswordGenerated}</InfoItem>
        <InfoItem>{t.infoStaffRole}</InfoItem>
      </ul>

      {assignToTeam && (
        <div className="mt-6 border-t border-[var(--line,rgba(194,196,201,.12))] pt-4">
          <h3 className="mb-3 text-sm font-medium text-[var(--t1,#f4edf7)]">
            {t.teamAttachTitle}
          </h3>
          <ul className="space-y-2 text-sm text-[var(--t3,#a39ba6)]">
            <InfoItem>{t.teamInfoBattleTag}</InfoItem>
            <InfoItem>{t.teamInfoAddedMembers}</InfoItem>
            <InfoItem>{t.teamInfoCaptain}</InfoItem>
          </ul>
        </div>
      )}
    </FicheSection>
  );
}
