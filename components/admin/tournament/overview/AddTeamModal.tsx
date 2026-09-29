import { memo, useState } from 'react';
import Modal from '@/components/admin/Modal';
import type { Dict, Team } from './types';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { INPUT, LABEL } from '@/features/admin/stages/ui/rubanClasses';

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
          <AdminButton size="sm" onClick={handleClose}>
            {tx.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!selectedTeamId || adding}
          >
            {adding ? tx.adding : tx.add}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={LABEL}>{tx.teamLabel}</label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className={INPUT}
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
          <label className={LABEL}>{tx.seedLabel}</label>
          <input
            type="number"
            value={teamSeed}
            onChange={(e) => setTeamSeed(e.target.value)}
            placeholder="1, 2, 3..."
            min={1}
            className={INPUT}
          />
        </div>
      </div>
    </Modal>
  );
}

export default memo(AddTeamModal);
