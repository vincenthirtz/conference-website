// features/admin/tournaments/ui/StaffCheckinModal.tsx — modale « Pointer
// pour l'équipe » de la console live check-in
// (components/admin/tournament/CheckinLivePanel.tsx) : rattrapage staff,
// motif obligatoire. Présentationnelle : l'appel (idempotent, checkin-staff)
// est fait par le panneau via `onSubmit`, qui rend `true` si c'est passé.

import { type FormEvent, useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentCheckinLive from '@/lib/i18n/locales/admin-fr/adminTournamentCheckinLive';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanErr,
  rubanFormLabel,
  rubanHelp,
  rubanInput,
} from '@/features/admin/_shared/ui/ruban';

// Mêmes bornes que le service (features/admin/matches/service/checkinStaff.ts).
const STAFF_REASON_MIN = 3;
const STAFF_REASON_MAX = 500;

/** Équipe visée par la modale « Pointer pour l'équipe ». */
export type StaffCheckinTarget = {
  matchId: string;
  side: 1 | 2;
  teamName: string;
};

export default function StaffCheckinModal({
  target,
  onClose,
  onSubmit,
}: {
  target: StaffCheckinTarget | null;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
}) {
  const t = useAdminT(nsAdminTournamentCheckinLive);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  // Champ vierge à chaque ouverture (autre équipe, autre motif).
  const targetKey = target ? `${target.matchId}:${target.side}` : null;
  useEffect(() => {
    if (targetKey) {
      setReason('');
      setTouched(false);
      setSubmitting(false);
    }
  }, [targetKey]);

  const trimmed = reason.trim();
  const tooShort = trimmed.length < STAFF_REASON_MIN;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (tooShort || submitting) return;
    setSubmitting(true);
    const ok = await onSubmit(trimmed);
    if (!ok) setSubmitting(false);
  }

  return (
    <Modal
      open={!!target}
      onClose={submitting ? () => {} : onClose}
      size="md"
      title={format(t.staffCheckinTitle, { team: target?.teamName ?? '—' })}
      subtitle={t.staffCheckinHelp}
      dataTestId="staff-checkin-modal"
      footer={
        <>
          <AdminButton variant="ghost" onClick={onClose} disabled={submitting}>
            {t.staffCheckinCancel}
          </AdminButton>
          <AdminButton
            type="submit"
            form="staff-checkin-form"
            disabled={submitting || tooShort}
          >
            {submitting ? t.staffCheckinSubmitting : t.staffCheckinConfirm}
          </AdminButton>
        </>
      }
    >
      <form id="staff-checkin-form" onSubmit={handleSubmit}>
        <label htmlFor="staff-checkin-reason" className={rubanFormLabel}>
          {t.staffCheckinReasonLabel}
        </label>
        <textarea
          id="staff-checkin-reason"
          className={rubanInput}
          rows={3}
          maxLength={STAFF_REASON_MAX}
          required
          value={reason}
          placeholder={t.staffCheckinReasonPlaceholder}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={submitting}
        />
        {touched && tooShort ? (
          <p className={`mt-1 text-xs ${rubanErr}`}>
            {format(t.staffCheckinReasonTooShort, { min: STAFF_REASON_MIN })}
          </p>
        ) : (
          <p className={`mt-1 ${rubanHelp}`}>
            {trimmed.length} / {STAFF_REASON_MAX}
          </p>
        )}
      </form>
    </Modal>
  );
}
