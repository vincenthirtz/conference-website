// features/player/notifications/ui/InboxList.tsx — « Historique » : la boîte
// de notifications durable de la joueuse (lot 4), personnelles et d'équipe
// mêlées, plus récentes d'abord. Présentationnel : reçoit la liste
// (hooks/useInbox).
//
// Chaque carte : famille (Match, Équipe, Scrim, Règlement, Autre), l'équipe
// quand la joueuse en gère plusieurs, titre, texte, date relative (date
// complète au survol), bouton d'action quand il y a un lien. Non lue à
// l'arrivée : point + « Nouveau » écrit, jamais la couleur seule — le temps
// de la visite, même une fois marquée lue.
//
// Notifications d'équipe : même rendu qu'avant (TeamNotificationsList.tsx),
// via inboxModel.ts.

import {
  Button,
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
import type { InboxItem } from '../inboxTypes';
import {
  absoluteDate,
  inboxItemAction,
  inboxItemText,
  inboxItemTitle,
  inboxKindGroup,
  relativeDate,
} from './inboxModel';

type Props = {
  items: InboxItem[];
  /** Identifiants non lus à l'arrivée : point + « Nouveau ». */
  fresh: ReadonlySet<string>;
  /** Non lues restées dans les pages pas encore chargées. */
  olderUnread: number;
  /** Nom des équipes, seulement quand la joueuse en a plusieurs. */
  teamNames: ReadonlyMap<string, string> | null;
  /** Inspection : aucun geste (« tout marquer »). */
  readOnly: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: boolean;
  onLoadMore: () => void;
  onMarkAll: () => void;
  markingAll: boolean;
  error?: boolean;
  /** Horloge des dates relatives (tests). */
  now?: number;
};

export default function InboxList({
  items,
  fresh,
  olderUnread,
  teamNames,
  readOnly,
  hasMore,
  loadingMore,
  moreError,
  onLoadMore,
  onMarkAll,
  markingAll,
  error,
  now,
}: Props) {
  const t = useT(nsPlayerNotifications);
  const locale = useLocale();

  if (error) {
    return (
      <div role="alert" className={rubanErrBox}>
        {t.historyLoadError}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card padding="md" className="text-center">
        <p className={rubanHelp}>{t.historyEmpty}</p>
      </Card>
    );
  }

  return (
    <>
      {!readOnly && olderUnread > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className={rubanHelp} data-numeric>
            {format(
              olderUnread > 1
                ? t.historyUnreadLeft_other
                : t.historyUnreadLeft_one,
              { count: olderUnread }
            )}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAll}
            disabled={markingAll}
            data-testid="inbox-mark-all"
          >
            {t.historyMarkAll}
          </Button>
        </div>
      )}

      <ul className="grid gap-3" aria-label={t.historyHeading}>
        {items.map((item) => {
          const isNew = fresh.has(item.id) || !item.readAt;
          const text = inboxItemText(item, t, locale);
          const action = inboxItemAction(item);
          const teamName =
            teamNames && item.teamId ? teamNames.get(item.teamId) : undefined;
          return (
            <li
              key={item.id}
              data-testid="inbox-item"
              data-unread={isNew ? 'true' : undefined}
            >
              <Card
                padding="md"
                className={
                  isNew ? 'border-l-2 border-l-[var(--or,#b467d1)]' : undefined
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <Chip tone="neutral">
                      {t.historyGroups[inboxKindGroup(item)]}
                    </Chip>
                    {teamName && (
                      <span className={rubanHelp}>
                        {format(t.historyTeam, { team: teamName })}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {isNew && (
                      <>
                        <span
                          aria-hidden="true"
                          className="inline-block h-2 w-2 rounded-full bg-[var(--or,#b467d1)]"
                        />
                        <Chip tone="brand">{t.teamNew}</Chip>
                      </>
                    )}
                    <time
                      dateTime={item.createdAt}
                      title={absoluteDate(item.createdAt, locale)}
                      className={rubanHelp}
                      data-numeric
                    >
                      {relativeDate(item.createdAt, locale, now)}
                    </time>
                  </span>
                </div>
                <p className={`mt-2 text-sm font-medium ${rubanStrong}`}>
                  {inboxItemTitle(item, t)}
                </p>
                {text && <p className={`mt-1 text-sm ${rubanMuted}`}>{text}</p>}
                {action && (
                  <div className="mt-3">
                    <ButtonLink
                      href={action.href}
                      variant="secondary"
                      size="sm"
                      data-testid={
                        action.kind === 'rules'
                          ? 'team-notification-rules-link'
                          : 'inbox-item-link'
                      }
                    >
                      {action.kind === 'rules' ? t.teamRulesCta : t.historyOpen}
                    </ButtonLink>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {moreError && (
        <div role="alert" className={`mt-3 ${rubanErrBox}`}>
          {t.historyMoreError}
        </div>
      )}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            onClick={onLoadMore}
            disabled={loadingMore}
            data-testid="inbox-load-more"
          >
            {loadingMore ? t.historyLoadingMore : t.historyLoadMore}
          </Button>
        </div>
      )}
    </>
  );
}
