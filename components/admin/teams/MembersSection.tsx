import React from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { TeamMemberRow } from '@/types/admin';
import type { TeamRole } from '@/utils/teamRoles';
import MemberRow from './MemberRow';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import nsAdminTeamsMembersSection from '@/lib/i18n/locales/admin-fr/adminTeamsMembersSection';

type MembersSectionProps = {
  membersCount: number;
  membersLoading: boolean;
  rosterMembers: TeamMemberRow[];
  subMembers: TeamMemberRow[];
  /** Encadrement (coach / manager) — hors roster jouant. */
  staffMembers: TeamMemberRow[];
  teamRoles: TeamRole[];
  captainUserId: string | null;
  swapSource: TeamMemberRow | null;
  selectedIds: Set<string>;
  selectionHasCaptain: boolean;
  bulkRole: string;
  bulkBusy: boolean;
  onCancelSwap: () => void;
  onOpenImport: () => void;
  onOpenAddMember: () => void;
  onSelectAll: (checked: boolean) => void;
  onBulkRoleChange: (role: string) => void;
  onBulkSetRole: () => void;
  onBulkSetSubstitute: (isSubstitute: boolean) => void;
  onBulkRemove: () => void;
  onClearSelection: () => void;
  onToggleSelected: (id: string) => void;
  onStartSwap: (member: TeamMemberRow) => void;
  onSwapWithSource: (member: TeamMemberRow) => void;
  onSetCaptain: (member: TeamMemberRow) => void;
  onEditMember: (member: TeamMemberRow) => void;
  onDeleteMember: (member: TeamMemberRow) => void;
};

function MembersSectionComponent({
  membersCount,
  membersLoading,
  rosterMembers,
  subMembers,
  staffMembers,
  teamRoles,
  captainUserId,
  swapSource,
  selectedIds,
  selectionHasCaptain,
  bulkRole,
  bulkBusy,
  onCancelSwap,
  onOpenImport,
  onOpenAddMember,
  onSelectAll,
  onBulkRoleChange,
  onBulkSetRole,
  onBulkSetSubstitute,
  onBulkRemove,
  onClearSelection,
  onToggleSelected,
  onStartSwap,
  onSwapWithSource,
  onSetCaptain,
  onEditMember,
  onDeleteMember,
}: MembersSectionProps) {
  const t = useAdminT(nsAdminTeamsMembersSection);
  const swapActive = Boolean(swapSource);
  const canSwapRoster = subMembers.length > 0;
  const canSwapSub = rosterMembers.length > 0;

  return (
    <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[19px] text-[var(--t1,#f4edf7)]">
          <svg
            className="w-5 h-5 text-[var(--t3,#a39ba6)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          {format(t.membersTitle, { count: membersCount })}
        </h2>
        <div className="flex items-center gap-2">
          {swapSource && (
            <AdminButton size="sm" onClick={onCancelSwap}>
              {t.cancelSwap}
            </AdminButton>
          )}
          <AdminButton
            size="sm"
            onClick={onOpenImport}
            data-testid="open-import-modal"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            {t.importBattleTags}
          </AdminButton>
          <AdminButton variant="secondary" size="sm" onClick={onOpenAddMember}>
            <svg
              className="w-4 h-4"
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
        </div>
      </div>

      {swapSource && (
        <div className="mb-4 flex items-center gap-2 rounded-[var(--r-ctrl,4px)] border border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.1)] px-4 py-3 text-sm text-[var(--t1,#f4edf7)]">
          <svg
            className="w-5 h-5 flex-shrink-0 text-[var(--or-200,#eec4ff)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
          <span>
            {t.selectToSwap} <strong>{swapSource.battle_tag}</strong>
          </span>
        </div>
      )}

      {/* Bulk actions toolbar */}
      {!swapSource && !membersLoading && membersCount > 0 && (
        <div
          className="mb-4 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-4 py-3"
          data-testid="bulk-toolbar"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
              <input
                type="checkbox"
                data-testid="select-all-members"
                checked={membersCount > 0 && selectedIds.size === membersCount}
                ref={(el) => {
                  if (el)
                    el.indeterminate =
                      selectedIds.size > 0 && selectedIds.size < membersCount;
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="h-4 w-4 accent-[var(--or,#b467d1)]"
              />
              <span data-testid="selection-count">
                {selectedIds.size > 0
                  ? format(t.selectedCount, { count: selectedIds.size })
                  : t.selectAll}
              </span>
            </label>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Bulk role */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={bulkRole}
                    onChange={(e) => onBulkRoleChange(e.target.value)}
                    disabled={bulkBusy}
                    data-testid="bulk-role-select"
                    className="h-[30px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-2.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
                  >
                    <option value="">{t.rolePlaceholder}</option>
                    {teamRoles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <AdminButton
                    variant="secondary"
                    size="xs"
                    onClick={onBulkSetRole}
                    disabled={!bulkRole || bulkBusy}
                    data-testid="bulk-role-apply"
                  >
                    {t.apply}
                  </AdminButton>
                </div>

                {/* Bulk substitute */}
                <AdminButton
                  size="xs"
                  onClick={() => onBulkSetSubstitute(true)}
                  disabled={bulkBusy}
                  data-testid="bulk-mark-sub"
                >
                  {t.markSub}
                </AdminButton>
                <AdminButton
                  size="xs"
                  onClick={() => onBulkSetSubstitute(false)}
                  disabled={bulkBusy}
                  data-testid="bulk-unmark-sub"
                >
                  {t.unmarkSub}
                </AdminButton>

                {/* Bulk remove */}
                <AdminButton
                  variant="danger"
                  size="xs"
                  onClick={onBulkRemove}
                  disabled={bulkBusy}
                  data-testid="bulk-remove"
                >
                  {t.removeFromTeam}
                </AdminButton>

                <button
                  onClick={onClearSelection}
                  disabled={bulkBusy}
                  className="px-2.5 py-1.5 text-sm text-[var(--t3,#a39ba6)] transition-colors hover:text-[var(--t1,#f4edf7)]"
                >
                  {t.deselect}
                </button>
              </div>
            )}
          </div>
          {selectionHasCaptain && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--warn,#f5a524)]">
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {t.captainProtected}
            </p>
          )}
        </div>
      )}

      {membersLoading ? (
        <div className="py-4 text-sm text-[var(--t3,#a39ba6)]">{t.loading}</div>
      ) : membersCount === 0 ? (
        <div className="rounded-[var(--r-ctrl,4px)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))] py-8 text-center text-sm text-[var(--t3,#a39ba6)]">
          {t.emptyTeam}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Roster (active members) */}
          <div>
            <h3 className="mb-2 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.22em] [font-stretch:75%] text-[var(--t3,#a39ba6)]">
              {format(t.rosterTitle, { count: rosterMembers.length })}
            </h3>
            {rosterMembers.length === 0 ? (
              <div className="rounded-[var(--r-ctrl,4px)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))] py-4 text-center text-sm text-[var(--t3,#a39ba6)]">
                {t.noActivePlayer}
              </div>
            ) : (
              <div className="space-y-2">
                {rosterMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    variant="roster"
                    isCaptain={captainUserId === member.user_id}
                    isSelected={selectedIds.has(member.id)}
                    swapActive={swapActive}
                    isSwapSource={swapSource?.id === member.id}
                    isSwapTarget={swapActive && swapSource!.id !== member.id}
                    canSwap={canSwapRoster}
                    onToggleSelected={onToggleSelected}
                    onStartSwap={onStartSwap}
                    onSwapWithSource={onSwapWithSource}
                    onSetCaptain={onSetCaptain}
                    onEdit={onEditMember}
                    onDelete={onDeleteMember}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Substitutes */}
          <div>
            <h3 className="mb-2 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.22em] [font-stretch:75%] text-[var(--t3,#a39ba6)]">
              {format(t.subsTitle, { count: subMembers.length })}
            </h3>
            {subMembers.length === 0 ? (
              <div className="rounded-[var(--r-ctrl,4px)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))] py-4 text-center text-sm text-[var(--t3,#a39ba6)]">
                {t.noSub}
              </div>
            ) : (
              <div className="space-y-2">
                {subMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    variant="sub"
                    isCaptain={false}
                    isSelected={selectedIds.has(member.id)}
                    swapActive={swapActive}
                    isSwapSource={swapSource?.id === member.id}
                    isSwapTarget={swapActive && swapSource!.id !== member.id}
                    canSwap={canSwapSub}
                    onToggleSelected={onToggleSelected}
                    onStartSwap={onStartSwap}
                    onSwapWithSource={onSwapWithSource}
                    onSetCaptain={onSetCaptain}
                    onEdit={onEditMember}
                    onDelete={onDeleteMember}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Encadrement — coach / manager. Hors roster jouant : ils ne
              comptent ni dans l'effectif, ni dans les échanges titulaire ↔
              remplaçante, et n'ont pas forcément de BattleTag. */}
          <div data-testid="team-staff-section">
            <h3 className="mb-2 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.22em] [font-stretch:75%] text-[var(--or-200,#eec4ff)]">
              {format(t.staffTitle, { count: staffMembers.length })}
            </h3>
            {staffMembers.length === 0 ? (
              <div className="rounded-[var(--r-ctrl,4px)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))] py-4 text-center text-sm text-[var(--t3,#a39ba6)]">
                {t.noStaff}
              </div>
            ) : (
              <div className="space-y-2">
                {staffMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    variant="staff"
                    isCaptain={false}
                    isSelected={selectedIds.has(member.id)}
                    swapActive={swapActive}
                    isSwapSource={false}
                    isSwapTarget={false}
                    canSwap={false}
                    onToggleSelected={onToggleSelected}
                    onStartSwap={onStartSwap}
                    onSwapWithSource={onSwapWithSource}
                    onSetCaptain={onSetCaptain}
                    onEdit={onEditMember}
                    onDelete={onDeleteMember}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const MembersSection = React.memo(MembersSectionComponent);

export default MembersSection;
