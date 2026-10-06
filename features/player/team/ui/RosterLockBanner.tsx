// features/player/team/ui/RosterLockBanner.tsx — verrou de roster vu par la
// capitaine (lot P7) : « Roster verrouillé depuis … » + demande de dérogation,
// ou « déverrouillé jusqu'au … » quand le staff a ouvert une fenêtre.
//
// Avant, rien ne l'annonçait : la capitaine découvrait le verrou par une 409
// en ajoutant une joueuse, et passait par Discord pour demander une
// dérogation. La demande part désormais en ticket de support typé.

import { useState } from 'react';
import { format } from '@/lib/i18n/useT';
import { formatSiteDate } from '@/utils/timezone';
import {
  ROSTER_UNLOCK_REASON_MAX,
  ROSTER_UNLOCK_REASON_MIN,
  type RosterLockView,
} from '@/utils/teams/rosterLockView';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  dateStyle: 'short',
  timeStyle: 'short',
};

export default function RosterLockBanner({
  t,
  lock,
  locale,
  busy,
  onRequest,
}: {
  t: ManageTeamTexts;
  lock: RosterLockView;
  locale: string;
  busy: boolean;
  /** Absent = pas le droit de gérer le roster (ou lecture seule) : pas de bouton. */
  onRequest?: (reason: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const tournament = lock.tournamentName ?? '—';

  if (!lock.locked) {
    if (!lock.unlockedUntil) return null;
    return (
      <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <p className="text-sm font-semibold text-emerald-100">
          {format(t.rosterUnlockedTitle, {
            date: formatSiteDate(lock.unlockedUntil, locale, DATE_OPTS),
          })}
        </p>
        <p className="mt-1 text-xs text-emerald-100/80">
          {format(t.rosterUnlockedBody, { tournament })}
        </p>
      </div>
    );
  }

  const trimmed = reason.trim();
  const valid =
    trimmed.length >= ROSTER_UNLOCK_REASON_MIN &&
    trimmed.length <= ROSTER_UNLOCK_REASON_MAX;

  const submit = async () => {
    if (!onRequest || !valid) return;
    if (await onRequest(trimmed)) {
      setOpen(false);
      setReason('');
    }
  };

  return (
    <div
      className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3"
      role="status"
    >
      <p className="text-sm font-semibold text-red-100">
        {format(t.rosterLockedTitle, {
          date: formatSiteDate(lock.lockedAt, locale, DATE_OPTS),
        })}
      </p>
      <p className="mt-1 text-xs text-red-100/80">
        {format(t.rosterLockedBody, { tournament })}
      </p>
      {lock.pendingRequest ? (
        <p className="mt-2 text-xs font-semibold text-red-100">
          {format(t.rosterUnlockPending, {
            date: formatSiteDate(
              lock.pendingRequest.createdAt,
              locale,
              DATE_OPTS
            ),
          })}
        </p>
      ) : onRequest && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={busy}
          className="mt-3 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-50 transition hover:bg-red-500/30 disabled:opacity-50"
        >
          {t.rosterUnlockCta}
        </button>
      ) : null}
      {onRequest && open && !lock.pendingRequest && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="block text-xs font-semibold text-red-100">
            {t.rosterUnlockReasonLabel}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={ROSTER_UNLOCK_REASON_MAX}
              rows={3}
              placeholder={t.rosterUnlockReasonPlaceholder}
              className="mt-1 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm font-normal text-white"
            />
          </label>
          <p className="text-xs text-red-100/60">
            {format(t.rosterUnlockReasonHint, {
              min: ROSTER_UNLOCK_REASON_MIN,
            })}
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !valid}
              className="rounded-lg bg-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-50 transition hover:bg-red-500/40 disabled:opacity-50"
            >
              {t.rosterUnlockSubmit}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs text-red-100/80 transition hover:text-red-50"
            >
              {t.rosterUnlockCancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
