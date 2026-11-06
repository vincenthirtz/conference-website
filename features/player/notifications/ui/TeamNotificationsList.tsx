// features/player/notifications/ui/TeamNotificationsList.tsx — « Notifications
// de l'équipe » : une carte par notification adressée à l'équipe (scrim
// accepté, scrim pris en compte), plus récentes d'abord — titre, date, texte,
// et la pastille « Nouveau » pour celles qui n'étaient pas lues à l'arrivée
// sur l'écran. Présentationnel : reçoit la liste (hooks/useTeamNotifications).
//
// LANGUE. Titre et phrase suivent la langue de la joueuse : la phrase est
// composée à l'affichage depuis le type et l'équipe adverse
// (`teamNotificationText`). Le texte rangé avec la notification, en
// français, reste le REPLI : type inconnu, ou équipe adverse inconnue
// (anciennes lignes comprises).

import {
  Card,
  Chip,
  rubanErrBox,
  rubanHelp,
  rubanMuted,
  rubanStrong,
} from '@/features/ruban';
import { format, useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';
import type { TeamNotification } from '../schemas';

type Dict = (typeof nsPlayerNotifications)['fr'];

export function teamNotificationTitle(kind: string, t: Dict): string {
  return (
    (t.teamKindLabels as Record<string, string>)[kind] ?? t.teamKindFallback
  );
}

/** Date du scrim, dans la langue de l'écran ; `null` si illisible. */
function scrimDateLabel(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * La phrase d'une notification, dans la langue de `t`. Repli sur le texte
 * rangé quand le type est inconnu ou que l'équipe adverse manque.
 */
export function teamNotificationText(
  n: Pick<TeamNotification, 'kind' | 'text' | 'opponentTeamName' | 'scrimDate'>,
  t: Dict,
  locale: string
): string {
  const opponent = n.opponentTeamName;
  if (!opponent) return n.text;
  switch (n.kind) {
    case 'scrim_accepted': {
      const date = scrimDateLabel(n.scrimDate, locale);
      return date
        ? format(t.teamText.scrim_accepted_dated, { opponent, date })
        : format(t.teamText.scrim_accepted, { opponent });
    }
    case 'scrim_acknowledged':
      return format(t.teamText.scrim_acknowledged, { opponent });
    default:
      return n.text;
  }
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
      {notifications.map((n) => {
        const text = teamNotificationText(n, t, locale);
        return (
          <li key={n.id} data-testid="team-notification">
            <Card padding="md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-sm font-medium ${rubanStrong}`}>
                  {teamNotificationTitle(n.kind, t)}
                </span>
                <span className="flex items-center gap-2">
                  {fresh.has(n.id) && <Chip tone="brand">{t.teamNew}</Chip>}
                  <time
                    dateTime={n.createdAt}
                    className={rubanHelp}
                    data-numeric
                  >
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
              {text && <p className={`mt-1 text-sm ${rubanMuted}`}>{text}</p>}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
