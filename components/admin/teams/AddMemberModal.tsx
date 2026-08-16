import React from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Modal from '@/components/admin/Modal';
import type { TeamRole } from '@/utils/teamRoles';
import { roleRequiresBattleTag } from '@/utils/teams/addMember';
import type { MemberFormState, SearchResult } from './types';
import nsAdminTeamsAddMemberModal from '@/lib/i18n/locales/admin-fr/adminTeamsAddMemberModal';

type AddMemberModalProps = {
  open: boolean;
  onClose: () => void;
  teamRoles: TeamRole[];
  memberForm: MemberFormState;
  setMemberForm: React.Dispatch<React.SetStateAction<MemberFormState>>;
  memberSaving: boolean;
  memberError: string | null;
  searchQuery: string;
  searchResults: SearchResult[];
  searchLoading: boolean;
  showSearchResults: boolean;
  onSearchChange: (query: string) => void;
  onSelectPlayer: (player: SearchResult) => void;
  onSubmit: () => void;
};

function AddMemberModalComponent({
  open,
  onClose,
  teamRoles,
  memberForm,
  setMemberForm,
  memberSaving,
  memberError,
  searchQuery,
  searchResults,
  searchLoading,
  showSearchResults,
  onSearchChange,
  onSelectPlayer,
  onSubmit,
}: AddMemberModalProps) {
  const t = useAdminT(nsAdminTeamsAddMemberModal);
  // Coach / manager = encadrement : pas forcément de compte Overwatch, donc
  // pas de BattleTag exigé (même règle que l'API, cf. utils/teams/addMember).
  const battleTagRequired = roleRequiresBattleTag(memberForm.role);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      backdropClassName="bg-black/70 backdrop-blur-md"
      panelChromeClassName="bg-gradient-to-b from-neutral-800 to-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl ring-1 ring-emerald-500/10 overflow-hidden"
      panelClassName="max-h-[90vh]"
      title={
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white">{t.title}</h3>
            <p className="text-xs text-neutral-400 mt-0.5">{t.subtitle}</p>
          </div>
        </div>
      }
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={onSubmit}
            disabled={memberSaving}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-emerald-900/40"
          >
            {memberSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.adding}
              </>
            ) : (
              <>
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
                {t.addPlayer}
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Search section */}
        <div className="relative">
          <label className="block text-sm font-medium text-neutral-200 mb-1.5">
            {t.searchLabel}
          </label>
          <p className="text-xs text-neutral-500 mb-2">{t.searchHint}</p>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-neutral-900/70 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 text-sm placeholder:text-neutral-500 transition-colors"
              placeholder={t.searchPlaceholder}
            />
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchLoading && (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Search results dropdown */}
          {showSearchResults && (
            <div className="absolute z-10 w-full mt-1.5 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto ring-1 ring-black/40">
              {searchResults.length === 0 && !searchLoading ? (
                <div className="px-4 py-3 text-sm text-neutral-400 text-center">
                  {t.noResults}
                </div>
              ) : (
                searchResults.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => onSelectPlayer(player)}
                    className="w-full px-3 py-2.5 text-left hover:bg-neutral-700/70 transition-colors flex items-center gap-3 border-b border-neutral-800 last:border-b-0"
                  >
                    <div className="w-9 h-9 rounded-lg bg-neutral-700 flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-4 h-4 text-neutral-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate text-white">
                        {player.battle_tag ||
                          player.display_name ||
                          player.email ||
                          t.playerFallback}
                      </div>
                      <div className="text-xs text-neutral-400 truncate">
                        {player.email}
                        {player.team_name && (
                          <span className="ml-2 text-amber-400">
                            {format(t.teamPrefix, { name: player.team_name })}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* OR separator */}
        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="flex-1 h-px bg-neutral-700" />
          <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            {t.orManual}
          </span>
          <div className="flex-1 h-px bg-neutral-700" />
        </div>

        {/* Manual entry */}
        <div className="rounded-xl bg-neutral-900/40 border border-neutral-700/60 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-200 mb-1.5">
                {t.emailLabel}
              </label>
              <input
                type="email"
                value={memberForm.email}
                onChange={(e) =>
                  setMemberForm((prev) => ({ ...prev, email: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 text-sm placeholder:text-neutral-500 transition-colors"
                placeholder="user@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-200 mb-1.5">
                {t.userIdLabel}
              </label>
              <input
                type="text"
                value={memberForm.userId}
                onChange={(e) =>
                  setMemberForm((prev) => ({ ...prev, userId: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 text-sm font-mono placeholder:text-neutral-500 transition-colors"
                placeholder="UUID"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-200 mb-1.5">
              BattleTag{' '}
              {battleTagRequired && <span className="text-red-400">*</span>}
            </label>
            <input
              type="text"
              required={battleTagRequired}
              value={memberForm.battleTag}
              onChange={(e) =>
                setMemberForm((prev) => ({
                  ...prev,
                  battleTag: e.target.value,
                }))
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 text-sm placeholder:text-neutral-500 transition-colors"
              placeholder="Pseudo#1234"
            />
            <p className="text-xs text-neutral-500 mt-1.5">
              {t.battleTagFormat}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-200 mb-1.5">
              {t.roleLabel}
            </label>
            <select
              value={memberForm.role}
              onChange={(e) =>
                setMemberForm((prev) => ({ ...prev, role: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 text-sm placeholder:text-neutral-500 transition-colors"
            >
              {teamRoles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status toggles */}
        <div>
          <label className="block text-sm font-medium text-neutral-200 mb-2">
            {t.statusLabel}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                memberForm.setCaptain
                  ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/40'
                  : 'bg-neutral-900/40 border-neutral-700 hover:border-neutral-600'
              }`}
            >
              <input
                type="checkbox"
                checked={memberForm.setCaptain}
                onChange={(e) =>
                  setMemberForm((prev) => ({
                    ...prev,
                    setCaptain: e.target.checked,
                    isSubstitute: false,
                  }))
                }
                className="sr-only"
              />
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  memberForm.setCaptain
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-neutral-800 text-neutral-500'
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l2.39 7.36H22l-6.18 4.49L18.21 22 12 17.27 5.79 22l2.39-8.15L2 9.36h7.61z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white">
                  {t.captain}
                </div>
                <div className="text-xs text-neutral-400">{t.captainDesc}</div>
              </div>
            </label>

            <label
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                memberForm.isSubstitute
                  ? 'bg-blue-500/10 border-blue-500/60 ring-1 ring-blue-500/40'
                  : 'bg-neutral-900/40 border-neutral-700 hover:border-neutral-600'
              }`}
            >
              <input
                type="checkbox"
                checked={memberForm.isSubstitute}
                onChange={(e) =>
                  setMemberForm((prev) => ({
                    ...prev,
                    isSubstitute: e.target.checked,
                    setCaptain: false,
                  }))
                }
                className="sr-only"
              />
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  memberForm.isSubstitute
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-neutral-800 text-neutral-500'
                }`}
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
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white">
                  {t.substitute}
                </div>
                <div className="text-xs text-neutral-400">
                  {t.substituteDesc}
                </div>
              </div>
            </label>
          </div>
        </div>

        {memberError && (
          <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2.5 text-sm text-red-200 flex items-start gap-2">
            <svg
              className="w-4 h-4 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{memberError}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

const AddMemberModal = React.memo(AddMemberModalComponent);

export default AddMemberModal;
