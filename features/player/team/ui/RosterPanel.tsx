// features/player/team/ui/RosterPanel.tsx — le roster : effectif (joueuses),
// alertes (capitaine, Discord), niveau et identité de l'équipe, lignes des
// membres — joueuses d'abord, encadrement ensuite sous son intitulé.

import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/features/ruban';
import { format } from '@/lib/i18n/useT';
import type nsOverwatchRank from '@/lib/i18n/locales/fr/overwatchRank';
import { splitTeamMembers } from '@/utils/teams/roleKind';
import type {
  ManagedTeamInfoDto,
  ManagedTeamMemberDto,
  TeamIdentityField,
} from '../schemas';
import type {
  CommitResult,
  ManageTeamTexts,
} from '../hooks/useManageTeamScreen';
import MemberControls, { type MemberControlsProps } from './MemberControls';
import MemberIdentity from './MemberIdentity';
import RosterAlerts from './RosterAlerts';
import TeamLevelBand from './TeamLevelBand';

type RowHandlers = Omit<
  MemberControlsProps,
  't' | 'tRank' | 'member' | 'label' | 'busy' | 'actionLoading' | 'hasCaptain'
>;

export default function RosterPanel({
  t,
  tRank,
  locale,
  team,
  members,
  hasCaptain,
  canEditRoster,
  canEditTeamInfo,
  actionLoading,
  memberLabel,
  roleLabel,
  rowHandlers,
  rightsPanel,
  onCommitTeamSkillRating,
  onCommitTeamIdentity,
}: {
  t: ManageTeamTexts;
  tRank: typeof nsOverwatchRank.fr;
  locale: string;
  team: ManagedTeamInfoDto;
  members: ManagedTeamMemberDto[];
  hasCaptain: boolean;
  canEditRoster: boolean;
  canEditTeamInfo: boolean;
  actionLoading: string | null;
  memberLabel: (m: ManagedTeamMemberDto) => string;
  roleLabel: (role: string | null | undefined) => string;
  rowHandlers: (m: ManagedTeamMemberDto) => RowHandlers;
  /** Panneau de droits délégués ouvert sous la ligne (null = fermé). */
  rightsPanel: (m: ManagedTeamMemberDto) => ReactNode;
  onCommitTeamSkillRating: (raw: string) => Promise<CommitResult>;
  onCommitTeamIdentity: (
    field: TeamIdentityField,
    raw: string
  ) => Promise<CommitResult>;
}) {
  const { roster, subs, staff } = splitTeamMembers(members);
  const ordered = [...roster, ...subs, ...staff];
  const firstStaffIndex = staff.length ? roster.length + subs.length : -1;
  const playingCount = roster.length + subs.length;
  const busy = Boolean(actionLoading);
  const slug = encodeURIComponent(team.slug || team.id);

  return (
    <Card as="section">
      <h2 className="text-lg font-semibold mb-4">
        {/* « Roster » = joueuses : l'encadrement ne compte pas dans l'effectif. */}
        {format(playingCount > 1 ? t.roster_other : t.roster_one, {
          count: playingCount,
        })}
      </h2>
      <RosterAlerts
        t={t}
        members={members}
        hasCaptain={hasCaptain}
        locale={locale}
      />
      <TeamLevelBand
        t={t}
        tRank={tRank}
        team={team}
        members={members}
        editable={canEditTeamInfo}
        busy={busy}
        onCommitSkillRating={onCommitTeamSkillRating}
        onCommitIdentity={onCommitTeamIdentity}
      />
      {members.filter((m) => !m.is_captain).length === 0 && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-5 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-500/20 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-purple-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-purple-100 mb-1">
            {t.onboardingTitle}
          </p>
          <p className="text-xs text-purple-200/80 mb-4">{t.onboardingBody}</p>
          <Link
            href={`/team/${slug}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition"
          >
            {t.onboardingCta}
          </Link>
        </div>
      )}
      <div className="space-y-3">
        {ordered.map((m, idx) => (
          <Fragment key={m.id}>
            {idx === firstStaffIndex && (
              <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-sky-300/80">
                {format(t.staffTitle, {
                  count: ordered.length - firstStaffIndex,
                })}
              </h3>
            )}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
              <MemberIdentity
                t={t}
                member={m}
                label={memberLabel(m)}
                roleLabel={roleLabel(m.role)}
                locale={locale}
              />
              {canEditRoster && (
                <MemberControls
                  t={t}
                  tRank={tRank}
                  member={m}
                  label={memberLabel(m)}
                  busy={busy}
                  actionLoading={actionLoading}
                  hasCaptain={hasCaptain}
                  {...rowHandlers(m)}
                />
              )}
            </div>
            {rightsPanel(m)}
          </Fragment>
        ))}
      </div>
    </Card>
  );
}
