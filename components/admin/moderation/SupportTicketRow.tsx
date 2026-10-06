// components/admin/moderation/SupportTicketRow.tsx — une ligne de la liste
// des tickets support (onglet « Support » de /admin/moderation).
//
// Sortie de SupportPanel.tsx (règle A7 : le panneau est gelé en taille).
// Présentationnelle : le clic ouvre la fiche, rien n'est chargé ici.

import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminSupport from '@/lib/i18n/locales/admin-fr/adminSupport';
import Chip from '@/features/admin/_shared/ui/Chip';
import WaitingChip from '@/features/admin/_shared/queue/WaitingChip';
import type { SupportTicket } from '@/features/admin/moderation/client';
import {
  formatDateFr,
  getCategoryLabels,
  getStatusLabels,
  severityTone,
  statusTone,
} from './supportLabels';

/** Un ticket encore à traiter (ni résolu ni fermé). */
export function isTicketPending(t: Pick<SupportTicket, 'status'>): boolean {
  return t.status === 'open' || t.status === 'in_progress';
}

export default function SupportTicketRow({
  ticket: t,
  onOpen,
}: {
  ticket: SupportTicket;
  onOpen: (t: SupportTicket) => void;
}) {
  const tx = useAdminT(nsAdminSupport);
  const categoryLabels = getCategoryLabels(tx);
  const statusLabels = getStatusLabels(tx);
  return (
    <button
      type="button"
      onClick={() => onOpen(t)}
      className="w-full text-left px-4 py-3 hover:bg-neutral-700/30 transition-colors flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex items-center gap-2 flex-shrink-0">
        <Chip tone={severityTone(t.severity)}>{t.severity.toUpperCase()}</Chip>
        <Chip tone={statusTone(t.status)}>{statusLabels[t.status]}</Chip>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-neutral-400">
            {categoryLabels[t.category]}
          </span>
          <span className="text-xs text-neutral-600">·</span>
          {isTicketPending(t) ? (
            <WaitingChip
              since={t.created_at}
              labels={{
                lessThanHour: tx.waitingLessThanHour,
                hours: tx.waitingHours,
                days: tx.waitingDays,
              }}
              title={format(tx.waitingTitle, {
                date: formatDateFr(t.created_at),
              })}
            />
          ) : (
            <span className="text-xs text-neutral-500">
              {formatDateFr(t.created_at)}
            </span>
          )}
          {t.assigned_staff_id && (
            <Chip tone="brand" data-testid="assigned-to">
              {format(tx.assignedTo, {
                name: t.assigned_to?.display_name || tx.assignUnknownStaff,
              })}
            </Chip>
          )}
          {t.source === 'discord_bot' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-700/30 text-indigo-200 border border-indigo-500/40">
              {tx.discordBadge}
            </span>
          )}
          {t.is_anonymous && (
            <span className="text-xs text-purple-300">{tx.anonymousTag}</span>
          )}
          {t.converted_player_blacklist_id && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-700/30 text-red-200 border border-red-500/40">
              {tx.convertedPlayerBadge}
            </span>
          )}
          {t.converted_entity_blacklist_id && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-700/30 text-purple-200 border border-purple-500/40">
              {tx.convertedEntityBadge}
            </span>
          )}
        </div>
        <div className="text-sm text-white mt-1 truncate">
          {t.subject || t.message.slice(0, 100)}
        </div>
        {!t.is_anonymous &&
          (t.reporter_name || t.reporter_email || t.discord_username) && (
            <div className="text-xs text-neutral-500 mt-0.5 truncate">
              {t.reporter_name || t.discord_username || ''}{' '}
              {t.reporter_email && (
                <span className="font-mono">({t.reporter_email})</span>
              )}
              {!t.reporter_email && t.discord_username && (
                <span className="font-mono">(@{t.discord_username})</span>
              )}
            </div>
          )}
      </div>
      <div className="text-xs text-neutral-500 font-mono flex-shrink-0">
        {t.id.slice(0, 8)}
      </div>
    </button>
  );
}
