// features/player/notifications/ui/TeamNotificationsList.tsx — « Notifications
// de l'équipe » : une carte par notification adressée à l'équipe (scrim
// accepté, scrim pris en compte, règlement d'un tournoi à valider), plus
// récentes d'abord — titre, date, texte, la pastille « Nouveau » pour celles
// qui n'étaient pas lues à l'arrivée sur l'écran, et pour le règlement le
// lien vers la liseuse. Présentationnel : reçoit la liste
// (hooks/useTeamNotifications).
//
// LOT 4. Quand la boîte durable répond (GET /api/player/inbox), l'écran rend
// l'Historique (InboxList.tsx), qui reprend les fonctions de ce fichier pour
// les notifications d'équipe ; cette liste reste le REPLI tant que l'API
// d'avant le lot 4 répond (route absente).
//
// LANGUE. Titre et phrase suivent la langue de la joueuse : la phrase est
// composée à l'affichage depuis le type et l'équipe adverse
// (`teamNotificationText`). Le texte rangé avec la notification, en
// français, reste le REPLI : type inconnu, ou équipe adverse inconnue
// (anciennes lignes comprises).

import {
  ButtonLink,
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
import { tournamentRulesUrls } from '@/features/player/tournamentRules/client';
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

/** Règlement d'un tournoi à valider : phrase avec le tournoi, lien vers la liseuse. */
const RULES_KINDS = new Set(['rules_validation_requested', 'rules_reminder']);

/** Lien vers la liseuse du règlement, ou `null` (scrim, tournoi inconnu). */
export function teamNotificationRulesHref(
  n: Pick<TeamNotification, 'kind' | 'tournamentId'>
): string | null {
  return RULES_KINDS.has(n.kind) && n.tournamentId
    ? tournamentRulesUrls.readerPage(n.tournamentId)
    : null;
}

/**
 * La phrase d'une notification, dans la langue de `t`. Repli sur le texte
 * rangé quand le type est inconnu ou que l'équipe adverse (scrim) ou le
 * tournoi (règlement) manque.
 */
export function teamNotificationText(
  n: Pick<
    TeamNotification,
    'kind' | 'text' | 'opponentTeamName' | 'scrimDate' | 'tournamentName'
  >,
  t: Dict,
  locale: string
): string {
  if (n.kind === 'rules_validation_requested' || n.kind === 'rules_reminder') {
    return n.tournamentName
      ? format(t.teamText[n.kind], { tournament: n.tournamentName })
      : n.text;
  }
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
        const rulesHref = teamNotificationRulesHref(n);
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
              {rulesHref && (
                <div className="mt-2">
                  <ButtonLink
                    href={rulesHref}
                    variant="secondary"
                    size="sm"
                    data-testid="team-notification-rules-link"
                  >
                    {t.teamRulesCta}
                  </ButtonLink>
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
