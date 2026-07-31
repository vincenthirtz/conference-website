import React from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { TeamMemberRow } from '@/types/admin';
import type { TeamRole } from '@/utils/teamRoles';
import MemberRow from './MemberRow';

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
  const t = useAdminT('adminTeamsMembersSection');
  const swapActive = Boolean(swapSource);
  const canSwapRoster = subMembers.length > 0;
  const canSwapSub = rosterMembers.length > 0;

  return (
    <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg
            className="w-5 h-5 text-neutral-400"
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
            <button
              onClick={onCancelSwap}
              className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancelSwap}
            </button>
          )}
          <button
            onClick={onOpenImport}
            className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors flex items-center gap-1.5"
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
          </button>
          <button
            onClick={onOpenAddMember}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-1.5"
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            {t.add}
          </button>
        </div>
      </div>

      {swapSource && (
        <div className="mb-4 rounded-xl bg-blue-900/30 border border-blue-500/40 px-4 py-3 text-sm flex items-center gap-2">
          <svg
            className="w-5 h-5 text-blue-400 flex-shrink-0"
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
          className="mb-4 rounded-xl bg-neutral-900/50 border border-neutral-700/60 px-4 py-3"
          data-testid="bulk-toolbar"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer select-none">
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
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-700"
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
                    className="px-2.5 py-1.5 rounded-lg bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">{t.rolePlaceholder}</option>
                    {teamRoles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={onBulkSetRole}
                    disabled={!bulkRole || bulkBusy}
                    data-testid="bulk-role-apply"
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >
                    {t.apply}
                  </button>
                </div>

                {/* Bulk substitute */}
                <button
                  onClick={() => onBulkSetSubstitute(true)}
                  disabled={bulkBusy}
                  data-testid="bulk-mark-sub"
                  className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  {t.markSub}
                </button>
                <button
                  onClick={() => onBulkSetSubstitute(false)}
                  disabled={bulkBusy}
                  data-testid="bulk-unmark-sub"
                  className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  {t.unmarkSub}
                </button>

                {/* Bulk remove */}
                <button
                  onClick={onBulkRemove}
                  disabled={bulkBusy}
                  data-testid="bulk-remove"
                  className="px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-900/70 text-red-200 border border-red-700/50 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  {t.removeFromTeam}
                </button>

                <button
                  onClick={onClearSelection}
                  disabled={bulkBusy}
                  className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-white text-sm transition-colors"
                >
                  {t.deselect}
                </button>
              </div>
            )}
          </div>
          {selectionHasCaptain && (
            <p className="mt-2 text-xs text-amber-300/90 flex items-center gap-1.5">
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
        <div className="text-neutral-400 text-sm py-4">{t.loading}</div>
      ) : membersCount === 0 ? (
        <div className="text-neutral-400 text-sm py-8 text-center bg-neutral-900/30 rounded-xl">
          {t.emptyTeam}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Roster (active members) */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2">
              {format(t.rosterTitle, { count: rosterMembers.length })}
            </h3>
            {rosterMembers.length === 0 ? (
              <div className="text-neutral-500 text-sm py-4 text-center bg-neutral-900/30 rounded-xl">
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
            <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2">
              {format(t.subsTitle, { count: subMembers.length })}
            </h3>
            {subMembers.length === 0 ? (
              <div className="text-neutral-500 text-sm py-4 text-center bg-neutral-900/30 rounded-xl">
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
            <h3 className="text-sm font-semibold text-violet-300/80 uppercase tracking-wide mb-2">
              {format(t.staffTitle, { count: staffMembers.length })}
            </h3>
            {staffMembers.length === 0 ? (
              <div className="text-neutral-500 text-sm py-4 text-center bg-neutral-900/30 rounded-xl">
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
