import { memo, useState } from 'react';
import Modal from '@/components/admin/Modal';
import type { Dict, Team } from './types';

type AddTeamModalProps = {
  open: boolean;
  /** Teams not yet registered in the tournament. */
  availableTeams: Team[];
  /** Close request (cancel / backdrop / escape / success). */
  onClose: () => void;
  /**
   * Persist the selection. Resolves `true` on success (modal closes + resets),
   * `false` on failure (modal stays open, parent surfaces the error banner).
   */
  onSubmit: (teamId: string, seed: number | null) => Promise<boolean>;
  tx: Dict;
};

/**
 * Single-team add modal. Input state (`selectedTeamId`, `teamSeed`, `adding`)
 * lives LOCALLY so typing/selecting never re-renders the whole overview page.
 * The parent only receives the final submission through `onSubmit`.
 */
function AddTeamModal({
  open,
  availableTeams,
  onClose,
  onSubmit,
  tx,
}: AddTeamModalProps) {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamSeed, setTeamSeed] = useState('');
  const [adding, setAdding] = useState(false);

  // Reset local input and bubble the close up (cancel/backdrop/escape).
  function handleClose() {
    setSelectedTeamId('');
    setTeamSeed('');
    onClose();
  }

  async function handleSubmit() {
    if (!selectedTeamId) return;
    setAdding(true);
    const ok = await onSubmit(
      selectedTeamId,
      teamSeed ? parseInt(teamSeed, 10) : null
    );
    setAdding(false);
    if (ok) {
      setSelectedTeamId('');
      setTeamSeed('');
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tx.addTeamTitle}
      footer={
        <>
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
          >
            {tx.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedTeamId || adding}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? tx.adding : tx.add}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-neutral-400 mb-1">
            {tx.teamLabel}
          </label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{tx.selectTeam}</option>
            {availableTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-1">
            {tx.seedLabel}
          </label>
          <input
            type="number"
            value={teamSeed}
            onChange={(e) => setTeamSeed(e.target.value)}
            placeholder="1, 2, 3..."
            min={1}
            className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </Modal>
  );
}

export default memo(AddTeamModal);
