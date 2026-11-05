// features/player/notifications/ui/TeamNotificationsList.tsx — « Notifications
// de l'équipe » : une carte par notification adressée à l'équipe (scrim
// accepté, scrim pris en compte), plus récentes d'abord — titre, date, texte,
// et la pastille « Nouveau » pour celles qui n'étaient pas lues à l'arrivée
// sur l'écran. Présentationnel : reçoit la liste (hooks/useTeamNotifications).
//
// Le texte est celui rangé avec la notification (en français) ; le titre suit
// la langue de l'écran.

import {
  Card,
  Chip,
  rubanErrBox,
  rubanHelp,
  rubanMuted,
  rubanStrong,
} from '@/features/ruban';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';
import type { TeamNotification } from '../schemas';

type Dict = (typeof nsPlayerNotifications)['fr'];

export function teamNotificationTitle(kind: string, t: Dict): string {
  return (
    (t.teamKindLabels as Record<string, string>)[kind] ?? t.teamKindFallback
  );
}

export default function TeamNotificationsList({
  notifications,
  fresh,
  error,
}: {
  notifications: TeamNotification[];
  /** Identifiants non lus à l'arrivée : pastille « Nouveau ». */
  fresh: ReadonlySet<string>;
  error?: boolean;
}) {
  const t = useT(nsPlayerNotifications);
  const locale = useLocale();

  if (error) {
    return (
      <div role="alert" className={rubanErrBox}>
        {t.teamLoadError}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <Card padding="md" className="text-center">
        <p className={rubanHelp}>{t.teamEmpty}</p>
      </Card>
    );
  }

  return (
    <ul className="grid gap-3" aria-label={t.teamHeading}>
      {notifications.map((n) => (
        <li key={n.id} data-testid="team-notification">
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-sm font-medium ${rubanStrong}`}>
                {teamNotificationTitle(n.kind, t)}
              </span>
              <span className="flex items-center gap-2">
                {fresh.has(n.id) && <Chip tone="brand">{t.teamNew}</Chip>}
                <time dateTime={n.createdAt} className={rubanHelp} data-numeric>
                  {new Date(n.createdAt).toLocaleString(locale, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </span>
            </div>
            {n.text && <p className={`mt-1 text-sm ${rubanMuted}`}>{n.text}</p>}
          </Card>
        </li>
      ))}
    </ul>
  );
}
