// features/admin/teams/ui/MyTeamMembersSection.tsx — la carte « Membres » de
// l'espace « mon équipe » (pages/admin/teams/my.tsx) en « Le Ruban » :
// décompte, bouton Ajouter, roster jouant puis encadrement à part.
//
// Purement présentationnel : chaque ligne arrive rendue par la page
// (`renderRow`), qui tient l'état d'édition et les actions de roster.

import type { ReactNode } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamsMy from '@/lib/i18n/locales/admin-fr/adminTeamsMy';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type { Member } from '@/components/admin/teams/my/types';
import { MyTeamIcon } from './MyTeamHeader';

const GROUP_TITLE =
  'mb-2 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.22em] [font-stretch:75%]';

export default function MyTeamMembersSection({
  canEdit,
  membersCount,
  subsCount,
  playingMembers,
  staffMembers,
  onOpenAdd,
  renderRow,
}: {
  canEdit: boolean;
  membersCount: number;
  subsCount: number;
  playingMembers: Member[];
  staffMembers: Member[];
  onOpenAdd: () => void;
  renderRow: (m: Member) => ReactNode;
}) {
  const t = useAdminT(nsAdminTeamsMy);

  let body: ReactNode;
  if (!membersCount) {
    body = (
      <div className="py-8 text-center text-[var(--t3,#a39ba6)]">
        <MyTeamIcon className="mx-auto mb-3 h-10 w-10 text-[var(--t4,#807984)]" />
        {t.noMembers}
      </div>
    );
  } else if (staffMembers.length === 0) {
    // Encadrement à part : coach et manager ne sont pas des joueuses, les
    // mélanger au roster gonflait l'effectif lu à l'œil. Même découpage que
    // /admin/teams/[id]/edit.
    body = <div className="space-y-2">{playingMembers.map(renderRow)}</div>;
  } else {
    body = (
      <div className="space-y-5">
        <div>
          <h3 className={`${GROUP_TITLE} text-[var(--t3,#a39ba6)]`}>
            {format(t.playersTitle, { count: playingMembers.length })}
          </h3>
          <div className="space-y-2">{playingMembers.map(renderRow)}</div>
        </div>
        <div data-testid="team-staff-section">
          <h3 className={`${GROUP_TITLE} text-[var(--or-200,#eec4ff)]`}>
            {format(t.staffTitle, { count: staffMembers.length })}
          </h3>
          <div className="space-y-2">{staffMembers.map(renderRow)}</div>
        </div>
      </div>
    );
  }

  return (
    <FicheSection
      title={t.members}
      aside={
        canEdit ? (
          <AdminButton variant="secondary" size="sm" onClick={onOpenAdd}>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            {t.add}
          </AdminButton>
        ) : undefined
      }
    >
      <p className="-mt-3 mb-4 text-xs text-[var(--t3,#a39ba6)]">
        {format(membersCount > 1 ? t.memberCount_other : t.memberCount_one, {
          count: membersCount,
        })}
        {subsCount > 0 ? (
          <span data-testid="substitute-count">
            {format(subsCount > 1 ? t.subCount_other : t.subCount_one, {
              count: subsCount,
            })}
          </span>
        ) : null}
      </p>
      {body}
    </FicheSection>
  );
}
