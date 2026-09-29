import { memo, useState } from 'react';
import Modal from '@/components/admin/Modal';
import type { Dict } from './types';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { INPUT, LABEL } from '@/features/admin/stages/ui/rubanClasses';

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
          <AdminButton size="sm" onClick={handleClose}>
            {tx.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!name.trim() || creating}
          >
            {creating ? tx.creating : tx.create}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={LABEL}>{tx.stageNameLabel}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tx.stageNamePlaceholder}
            className={INPUT}
          />
        </div>

        <div>
          <label className={LABEL}>{tx.stageTypeLabel}</label>
          <select
            value={stageType}
            onChange={(e) => setStageType(e.target.value)}
            className={INPUT}
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
