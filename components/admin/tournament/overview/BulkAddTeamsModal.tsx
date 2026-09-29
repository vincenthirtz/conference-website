import { memo, useMemo, useState } from 'react';
import Image from 'next/image';
import Modal from '@/components/admin/Modal';
import { format } from '@/lib/i18n/useAdminT';
import type { Dict, Team } from './types';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanFaint,
  rubanFormInput,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';

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
          <AdminButton size="sm" onClick={handleClose} disabled={adding}>
            {tx.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={selected.size === 0 || adding}
          >
            {adding
              ? format(tx.bulkAddingProgress, {
                  done: progress.done,
                  total: progress.total,
                })
              : format(tx.bulkAddButton, {
                  count: selected.size > 0 ? `(${selected.size})` : '',
                })}
          </AdminButton>
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
          className={`mb-3 ${rubanFormInput}`}
        />

        {/* Select all / deselect all */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs ${rubanMuted}`}>
            {format(tx.selectedTeamsCount, {
              count: selected.size,
            })}
          </span>
          <div className="flex gap-2">
            <AdminButton
              size="xs"
              onClick={() => setSelected(new Set(filtered.map((t) => t.id)))}
            >
              {tx.selectAll}
            </AdminButton>
            <AdminButton size="xs" onClick={() => setSelected(new Set())}>
              {tx.deselectAll}
            </AdminButton>
          </div>
        </div>

        {/* Team checkbox list */}
        <div className="mb-4 max-h-64 space-y-1 overflow-y-auto rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-2">
          {filtered.map((team) => (
            <label
              key={team.id}
              className="flex cursor-pointer items-center gap-3 rounded-[var(--r-ctrl,4px)] px-2 py-1.5 transition-colors hover:bg-[var(--s3,#2f2732)]"
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
                className="rounded-[3px]"
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
            <div className={`py-4 text-center text-sm ${rubanFaint}`}>
              {tx.noAvailableTeam}
            </div>
          )}
        </div>

        {/* Progress indicator */}
        {adding && (
          <div className="mb-4">
            <div
              className={`mb-1 flex items-center gap-2 text-xs ${rubanMuted}`}
            >
              <div className="h-3 w-3 animate-spin rounded-full border border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]" />
              {format(tx.bulkAddingInProgress, {
                done: progress.done,
                total: progress.total,
              })}
            </div>
            <div className="h-1.5 w-full rounded-[2px] bg-[var(--s3,#2f2732)]">
              <div
                className="h-1.5 rounded-[2px] bg-[var(--or,#b467d1)] transition-all"
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
