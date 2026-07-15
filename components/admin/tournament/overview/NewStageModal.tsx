import { memo, useState } from 'react';
import Modal from '@/components/admin/Modal';
import type { Dict } from './types';

type StageTypeOption = { value: string; label: string };

type NewStageModalProps = {
  open: boolean;
  stageTypeOptions: StageTypeOption[];
  onClose: () => void;
  /**
   * Persist the new stage. Resolves `true` on success (modal closes + resets),
   * `false` on failure (modal stays open, parent surfaces the error banner).
   */
  onSubmit: (name: string, stageType: string) => Promise<boolean>;
  tx: Dict;
};

/**
 * New-stage creation modal. Input state (`name`, `type`, `creating`) lives
 * LOCALLY so typing the stage name never re-renders the whole overview page.
 */
function NewStageModal({
  open,
  stageTypeOptions,
  onClose,
  onSubmit,
  tx,
}: NewStageModalProps) {
  const [name, setName] = useState('');
  const [stageType, setStageType] = useState('bracket');
  const [creating, setCreating] = useState(false);

  function handleClose() {
    setName('');
    setStageType('bracket');
    onClose();
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    const ok = await onSubmit(trimmed, stageType);
    setCreating(false);
    if (ok) {
      setName('');
      setStageType('bracket');
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tx.createStageTitle}
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
            disabled={!name.trim() || creating}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? tx.creating : tx.create}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-neutral-400 mb-1">
            {tx.stageNameLabel}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tx.stageNamePlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-1">
            {tx.stageTypeLabel}
          </label>
          <select
            value={stageType}
            onChange={(e) => setStageType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {stageTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}

export default memo(NewStageModal);
