// features/admin/stages/ui/DisqualifyTeamModal.tsx — « Disqualifier une
// équipe » d'une phase. Présentationnelle : l'appel réseau vit dans
// `hooks/useStageTeamDisqualification`.
//
// Aucun mode n'est présélectionné : les deux ont des effets très différents
// sur le classement de TOUTES les équipes, l'organisatrice doit choisir en
// connaissance de cause. Le motif est obligatoire (journal staff).

import { useId, useState } from 'react';
import Modal from '@/components/ui/Modal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanFormInput,
  rubanFormLabel,
  rubanHelp,
  rubanMuted,
  rubanStrong,
} from '@/features/admin/_shared/ui/ruban';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminStageTeams from '@/lib/i18n/locales/admin-fr/adminStageTeams';
import type { DisqualificationMode } from '../client';

export const DQ_REASON_MIN = 3;
export const DQ_REASON_MAX = 500;

/** Motif valide côté serveur : 3 à 500 caractères après trim. */
export function isValidDisqualificationReason(reason: string): boolean {
  const n = reason.trim().length;
  return n >= DQ_REASON_MIN && n <= DQ_REASON_MAX;
}

export type DisqualifyDraft = { mode: DisqualificationMode; reason: string };

const CARD =
  'flex cursor-pointer gap-3 rounded-[var(--r-ctrl,4px)] border p-3 transition-colors';
const CARD_OFF =
  'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] hover:border-[var(--t4,#807984)]';
const CARD_ON =
  'border-[rgba(255,107,107,.55)] bg-[rgba(255,107,107,.08)] text-[var(--t1,#f4edf7)]';

function ModeCard({
  mode,
  title,
  desc,
  checked,
  disabled,
  onPick,
}: {
  mode: DisqualificationMode;
  title: string;
  desc: string;
  checked: boolean;
  disabled: boolean;
  onPick: (m: DisqualificationMode) => void;
}) {
  const descId = useId();
  return (
    <label className={`${CARD} ${checked ? CARD_ON : CARD_OFF}`}>
      <input
        type="radio"
        name="dq-mode"
        value={mode}
        className="mt-1"
        checked={checked}
        disabled={disabled}
        aria-label={title}
        aria-describedby={descId}
        onChange={() => onPick(mode)}
      />
      <span>
        <span className={`block text-sm font-semibold ${rubanStrong}`}>
          {title}
        </span>
        <span id={descId} className={`mt-1 block text-xs ${rubanMuted}`}>
          {desc}
        </span>
      </span>
    </label>
  );
}

export default function DisqualifyTeamModal({
  teamName,
  submitting,
  onClose,
  onConfirm,
}: {
  teamName: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (draft: DisqualifyDraft) => void;
}) {
  const t = useAdminT(nsAdminStageTeams);
  const reasonId = useId();
  const [mode, setMode] = useState<DisqualificationMode | null>(null);
  const [reason, setReason] = useState('');
  const valid = mode !== null && isValidDisqualificationReason(reason);

  const summary =
    mode === 'forfeit'
      ? t.dqSummaryForfeit
      : mode === 'annul'
        ? t.dqSummaryAnnul
        : t.dqSummaryPick;

  function submit() {
    if (!valid || submitting || !mode) return;
    onConfirm({ mode, reason: reason.trim() });
  }

  return (
    <Modal
      open
      onClose={submitting ? () => {} : onClose}
      size="lg"
      dataTestId="disqualify-team-modal"
      title={
        <h3 className="text-[17px] text-[var(--t1,#f4edf7)]">
          {format(t.dqModalTitle, { team: teamName })}
        </h3>
      }
      footer={
        <div className="flex w-full justify-end gap-2">
          <AdminButton size="sm" onClick={onClose} disabled={submitting}>
            {t.dqCancel}
          </AdminButton>
          <AdminButton
            variant="danger"
            size="sm"
            onClick={submit}
            disabled={!valid || submitting}
          >
            {submitting ? t.dqSubmitting : t.dqConfirm}
          </AdminButton>
        </div>
      }
    >
      <div className="space-y-4">
        <p className={`text-sm ${rubanMuted}`}>{t.dqModalIntro}</p>

        <fieldset className="space-y-2">
          <legend className={rubanFormLabel}>{t.dqModeLegend}</legend>
          <ModeCard
            mode="forfeit"
            title={t.dqModeForfeitTitle}
            desc={t.dqModeForfeitDesc}
            checked={mode === 'forfeit'}
            disabled={submitting}
            onPick={setMode}
          />
          <ModeCard
            mode="annul"
            title={t.dqModeAnnulTitle}
            desc={t.dqModeAnnulDesc}
            checked={mode === 'annul'}
            disabled={submitting}
            onPick={setMode}
          />
        </fieldset>

        <div>
          <label htmlFor={reasonId} className={rubanFormLabel}>
            {t.dqReasonLabel}
          </label>
          <textarea
            id={reasonId}
            rows={3}
            maxLength={DQ_REASON_MAX}
            className={rubanFormInput}
            placeholder={t.dqReasonPlaceholder}
            value={reason}
            disabled={submitting}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className={`flex justify-between gap-2 ${rubanHelp}`}>
            <span>{t.dqReasonHelp}</span>
            <span className="font-mono" data-testid="dq-reason-count">
              {reason.trim().length}/{DQ_REASON_MAX}
            </span>
          </div>
        </div>

        <div
          className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3 text-sm"
          data-testid="dq-summary"
        >
          <p className={rubanStrong}>{format(summary, { team: teamName })}</p>
          {mode && (
            <p className={`mt-1 text-xs ${rubanMuted}`}>{t.dqSummaryCaveat}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
