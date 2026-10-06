// components/admin/moderation/SupportResolutionForm.tsx — note de résolution
// et changement de statut d'un ticket support, avec la case « Notifier la
// personne » (email à l'auteur·ice quand le ticket est résolu ou fermé).
//
// Sortie de SupportPanel.tsx (règle A7). Présentationnelle : la page envoie.

import { useState } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminSupport from '@/lib/i18n/locales/admin-fr/adminSupport';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type {
  SupportTicket,
  TicketStatus,
} from '@/features/admin/moderation/client';

const FIELD =
  'w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm';

/** La personne a laissé de quoi la recontacter par email. */
export function canNotifyReporter(
  t: Pick<SupportTicket, 'is_anonymous' | 'reporter_email'>
): boolean {
  return !t.is_anonymous && !!t.reporter_email?.trim();
}

export default function SupportResolutionForm({
  ticket,
  note,
  onNoteChange,
  updating,
  onUpdate,
}: {
  ticket: SupportTicket;
  note: string;
  onNoteChange: (value: string) => void;
  updating: boolean;
  /** `notify` : ne vaut que pour `resolved` / `closed`. */
  onUpdate: (status: TicketStatus, notify: boolean) => void;
}) {
  const tx = useAdminT(nsAdminSupport);
  const reachable = canNotifyReporter(ticket);
  const [notify, setNotify] = useState(false);
  const notifyOn = notify && reachable;

  return (
    <div className="space-y-3 border-t border-neutral-700 pt-4">
      <label className="block text-sm font-medium text-neutral-200">
        {tx.resolutionLabel}
      </label>
      <textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        rows={3}
        className={FIELD}
        placeholder={tx.resolutionPlaceholder}
      />
      <label className="flex items-start gap-2 text-sm text-neutral-200">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={notifyOn}
          disabled={!reachable || updating}
          onChange={(e) => setNotify(e.target.checked)}
          data-testid="notify-reporter"
        />
        <span>
          {tx.notifyReporter}
          <span className="block text-xs text-neutral-500">
            {reachable ? tx.notifyReporterHelp : tx.notifyNoContact}
          </span>
        </span>
      </label>
      <div className="flex flex-wrap gap-2 justify-end">
        <AdminButton
          variant="ghost"
          size="sm"
          onClick={() => onUpdate('in_progress', false)}
          disabled={updating || ticket.status === 'in_progress'}
        >
          {tx.markInProgress}
        </AdminButton>
        <AdminButton
          variant="primary"
          size="sm"
          onClick={() => onUpdate('resolved', notifyOn)}
          disabled={updating || ticket.status === 'resolved'}
        >
          {tx.markResolved}
        </AdminButton>
        <AdminButton
          variant="ghost"
          size="sm"
          onClick={() => onUpdate('closed', notifyOn)}
          disabled={updating || ticket.status === 'closed'}
        >
          {tx.close}
        </AdminButton>
      </div>
    </div>
  );
}
