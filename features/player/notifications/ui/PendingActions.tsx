// features/player/notifications/ui/PendingActions.tsx — « En attente » : une
// ligne par compteur non nul, qui mène à l'écran où l'on agit (lot P15).
// Présentationnel : reçoit les compteurs.

import {
  Card,
  Chip,
  rubanHelp,
  rubanRowIcon,
  rubanStrong,
} from '@/features/ruban';
import { useT } from '@/lib/i18n/useT';
import nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';
import { ListeRow } from '../../_shared/ui';
import type { PlayerNotificationsPayload } from '../schemas';

const ICONS = {
  messages: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  scrim: 'M22 12a10 10 0 11-20 0 10 10 0 0120 0zM10 8l6 4-6 4z',
  team: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  checkin: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

type Action = {
  href: string;
  label: string;
  description: string;
  icon: string;
  badge?: number;
};

export function pendingActions(
  counters: PlayerNotificationsPayload | undefined,
  t: {
    unreadMessages: string;
    unreadMessagesDesc: string;
    pendingScrims: string;
    pendingScrimsDesc: string;
    joinRequests: string;
    joinRequestsDesc: string;
    checkinPending: string;
    checkinPendingDesc: string;
  }
): Action[] {
  if (!counters) return [];
  const out: Action[] = [];
  if (counters.unreadMessages > 0)
    out.push({
      href: '/player/messages',
      label: t.unreadMessages,
      description: t.unreadMessagesDesc,
      icon: ICONS.messages,
      badge: counters.unreadMessages,
    });
  if (counters.pendingScrims > 0)
    out.push({
      href: '/player',
      label: t.pendingScrims,
      description: t.pendingScrimsDesc,
      icon: ICONS.scrim,
      badge: counters.pendingScrims,
    });
  if (counters.pendingJoinRequests > 0)
    out.push({
      href: '/player/manage-team',
      label: t.joinRequests,
      description: t.joinRequestsDesc,
      icon: ICONS.team,
      badge: counters.pendingJoinRequests,
    });
  if (counters.checkinPending > 0)
    out.push({
      href: '/player/checkin',
      label: t.checkinPending,
      description: t.checkinPendingDesc,
      icon: ICONS.checkin,
    });
  return out;
}

export default function PendingActions({
  counters,
}: {
  counters: PlayerNotificationsPayload | undefined;
}) {
  const t = useT(nsPlayerNotifications);
  const actions = pendingActions(counters, t);

  if (actions.length === 0) {
    return (
      <Card padding="md" className="text-center">
        <p className={`text-sm font-medium ${rubanStrong}`}>{t.allUpToDate}</p>
        <p className={rubanHelp}>{t.noPending}</p>
      </Card>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {actions.map((a) => (
        <ListeRow key={a.href + a.icon} href={a.href}>
          <span className="flex min-w-0 items-center gap-3">
            <span className={rubanRowIcon} aria-hidden="true">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
              </svg>
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-medium ${rubanStrong}`}>
                {a.label}
              </span>
              <span className={`block ${rubanHelp}`}>{a.description}</span>
            </span>
          </span>
          {a.badge !== undefined && (
            <Chip tone="brand">
              <span data-numeric>{a.badge}</span>
            </Chip>
          )}
        </ListeRow>
      ))}
    </ul>
  );
}
