// features/admin/teams/ui/MyTeamAddMemberModal.tsx — la modale « Ajouter un
// membre » de l'espace « mon équipe » (pages/admin/teams/my.tsx) en « Le
// Ruban » : recherche d'une joueuse, puis BattleTag et rôle.
//
// Purement présentationnel : la page tient la recherche (debounce +
// annulation), la sélection et l'ajout (POST).

import Modal from '@/components/admin/Modal';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamsMy from '@/lib/i18n/locales/admin-fr/adminTeamsMy';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { PlayerSearchResults } from '@/components/admin/teams/my/PlayerSearchResults';
import type { SearchResult } from '@/components/admin/teams/my/types';
import { roleRequiresBattleTag } from '@/utils/teams/roleKind';
import {
  MY_TEAM_HELP,
  MY_TEAM_INPUT,
  MY_TEAM_LABEL,
  MY_TEAM_SPINNER,
} from './MyTeamClasses';

export default function MyTeamAddMemberModal({
  open,
  onClose,
  captainScopeUnavailable,
  selectedPlayer,
  onSelectPlayer,
  onClearPlayer,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  searchLoading,
  battleTag,
  onBattleTagChange,
  role,
  onRoleChange,
  adding,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  captainScopeUnavailable: boolean;
  selectedPlayer: SearchResult | null;
  onSelectPlayer: (player: SearchResult) => void;
  onClearPlayer: () => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  searchResults: SearchResult[];
  searchLoading: boolean;
  battleTag: string;
  onBattleTagChange: (v: string) => void;
  role: string;
  onRoleChange: (v: string) => void;
  adding: boolean;
  onAdd: () => void;
}) {
  const t = useAdminT(nsAdminTeamsMy);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      backdropClassName="bg-black/70 backdrop-blur-sm"
      panelClassName="max-h-[90vh] overflow-hidden"
      title={t.addMemberModalTitle}
      footer={
        selectedPlayer ? (
          <>
            <AdminButton variant="ghost" size="sm" onClick={onClose}>
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              size="sm"
              onClick={onAdd}
              disabled={adding || !battleTag}
            >
              {adding ? (
                <>
                  <div className={`h-4 w-4 ${MY_TEAM_SPINNER}`} />
                  {t.adding}
                </>
              ) : (
                t.add
              )}
            </AdminButton>
          </>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {captainScopeUnavailable && (
          <p className="rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.13)] px-3 py-2 text-xs text-[var(--t1,#f4edf7)]">
            {t.noCaptainScope}
          </p>
        )}
        {!selectedPlayer ? (
          <>
            {/* Search input */}
            <div>
              <label className={MY_TEAM_LABEL}>{t.searchLabel}</label>
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--t4,#807984)]"
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
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className={`${MY_TEAM_INPUT} pl-10`}
                  autoFocus
                />
              </div>
            </div>

            {/* Search results */}
            <PlayerSearchResults
              results={searchResults}
              searchLoading={searchLoading}
              searchQuery={searchQuery}
              onSelect={onSelectPlayer}
            />
          </>
        ) : (
          <>
            {/* Selected player form */}
            <div className="rounded-[var(--r-ctrl,4px)] border-l-[3px] border-[var(--or,#b467d1)] bg-[var(--s2,#1d1520)] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-[var(--t1,#f4edf7)]">
                    {selectedPlayer.display_name ||
                      selectedPlayer.email ||
                      t.userFallback}
                  </div>
                  {selectedPlayer.email && (
                    <div className="text-xs text-[var(--t3,#a39ba6)]">
                      {selectedPlayer.email}
                    </div>
                  )}
                </div>
                <button
                  onClick={onClearPlayer}
                  className="text-sm text-[var(--or-200,#eec4ff)] transition-colors hover:text-[var(--t1,#f4edf7)]"
                >
                  {t.change}
                </button>
              </div>
            </div>

            <div>
              <label className={MY_TEAM_LABEL}>
                {t.battleTagLabel}{' '}
                {roleRequiresBattleTag(role) && (
                  <span className="text-[var(--err,#ff6b6b)]">*</span>
                )}
              </label>
              <input
                type="text"
                value={battleTag}
                onChange={(e) => onBattleTagChange(e.target.value)}
                placeholder={t.battleTagPlaceholder}
                className={MY_TEAM_INPUT}
              />
              <p className={MY_TEAM_HELP}>{t.battleTagHelp}</p>
            </div>

            <div>
              <label className={MY_TEAM_LABEL}>{t.roleLabel}</label>
              <select
                value={role}
                onChange={(e) => onRoleChange(e.target.value)}
                className={MY_TEAM_INPUT}
              >
                <option value="player">{t.roleOptionPlayer}</option>
                <option value="tank">{t.roleOptionTank}</option>
                <option value="dps">{t.roleOptionDps}</option>
                <option value="support">{t.roleOptionSupport}</option>
                <option value="flex">{t.roleOptionFlex}</option>
                <option value="coach">{t.roleOptionCoach}</option>
                <option value="manager">{t.roleOptionManager}</option>
              </select>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
