import { memo, useMemo, useState } from 'react';
import Image from 'next/image';
import Modal from '@/components/admin/Modal';
import { format } from '@/lib/i18n/useAdminT';
import type { Dict, Team } from './types';

type BulkProgress = { done: number; total: number };

type BulkAddTeamsModalProps = {
  open: boolean;
  /** Teams not yet registered in the tournament. */
  availableTeams: Team[];
  onClose: () => void;
  /**
   * Add every selected team. The parent runs the mutation loop and reports
   * progress through `onProgress`; the modal owns the progress/adding UI.
   */
  onSubmit: (
    teamIds: string[],
    onProgress: (done: number, total: number) => void
  ) => Promise<void>;
  tx: Dict;
};

/**
 * Bulk team-add modal. The heavy per-keystroke state — the search filter and
 * the selected-ids set — lives LOCALLY, so filtering/selecting never re-renders
 * the whole overview page (the original P2-4 typing-lag source). The parent
 * only receives the final list of team ids to persist.
 */
function BulkAddTeamsModal({
  open,
  availableTeams,
  onClose,
  onSubmit,
  tx,
}: BulkAddTeamsModalProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<BulkProgress>({ done: 0, total: 0 });

  // Single derived list, reused by the "select all", the checkbox list and the
  // empty-state check (replaces the 3 inline filters of the original).
  const filtered = useMemo(
    () =>
      availableTeams.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase())
      ),
    [availableTeams, search]
  );

  function reset() {
    setSelected(new Set());
    setSearch('');
  }

  function handleClose() {
    if (adding) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    setAdding(true);
    setProgress({ done: 0, total: ids.length });
    await onSubmit(ids, (done, total) => setProgress({ done, total }));
    setAdding(false);
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tx.bulkAddTitle}
      size="lg"
      disableBackdropClose={adding}
      disableEscapeClose={adding}
      footer={
        <>
          <button
            onClick={handleClose}
            disabled={adding}
            className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {tx.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={selected.size === 0 || adding}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding
              ? format(tx.bulkAddingProgress, {
                  done: progress.done,
                  total: progress.total,
                })
              : format(tx.bulkAddButton, {
                  count: selected.size > 0 ? `(${selected.size})` : '',
                })}
          </button>
        </>
      }
    >
      <>
        {/* Search filter */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tx.searchTeamPlaceholder}
          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 text-sm"
        />

        {/* Select all / deselect all */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-neutral-400">
            {format(tx.selectedTeamsCount, {
              count: selected.size,
            })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set(filtered.map((t) => t.id)))}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {tx.selectAll}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-neutral-400 hover:text-neutral-300 transition-colors"
            >
              {tx.deselectAll}
            </button>
          </div>
        </div>

        {/* Team checkbox list */}
        <div className="max-h-64 overflow-y-auto space-y-1 mb-4 border border-neutral-700 rounded-lg p-2">
          {filtered.map((team) => (
            <label
              key={team.id}
              className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-neutral-700/50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(team.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) {
                    next.add(team.id);
                  } else {
                    next.delete(team.id);
                  }
                  setSelected(next);
                }}
                className="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              {team.logo_url && (
                <Image
                  src={team.logo_url}
                  alt=""
                  width={20}
                  height={20}
                  className="w-5 h-5 rounded object-cover"
                />
              )}
              <span className="text-sm">{team.name}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <div className="text-neutral-500 text-sm text-center py-4">
              {tx.noAvailableTeam}
            </div>
          )}
        </div>

        {/* Progress indicator */}
        {adding && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
              <div className="w-3 h-3 border border-neutral-500 border-t-white rounded-full animate-spin" />
              {format(tx.bulkAddingInProgress, {
                done: progress.done,
                total: progress.total,
              })}
            </div>
            <div className="w-full bg-neutral-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{
                  width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </>
    </Modal>
  );
}

export default memo(BulkAddTeamsModal);
