// components/admin/moderation/LibraryChatMessagesPanel.tsx
// Onglet « Library » du hub /admin/moderation : les MESSAGES RÉCENTS du chat
// de la Women's Library, par salle (lot 6 de docs/PLAN-womens-library.md),
// avec les gestes du staff : masquer (il disparaît chez toutes), mettre en
// sourdine (dans la salle ou partout). Bannir reste au formulaire du dessous.
//
//   GET  /api/admin/library/messages?roomId=&cursor= → { items, nextCursor, chatEnabled }
//   POST /api/admin/library/messages/hide             → { id, hidden, alreadyHidden }
//
// Les messages sont du TEXTE BRUT, affichés tels quels (jamais interprétés).
// Les messages masqués restent visibles ici, marqués, jusqu'à la purge.

import { useMemo } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminModeration from '@/lib/i18n/locales/admin-fr/adminModeration';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import AlertBanner from '@/components/admin/AlertBanner';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import {
  useHideLibraryChatMessage,
  useLibraryChatMessages,
} from '@/features/admin/library/hooks/useLibraryChatModeration';
import type { AdminLibraryChatMessage } from '@/features/admin/library/chatModel';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import LibraryChatMuteForm from './LibraryChatMuteForm';
import { roomsOf } from './libraryChat';

type Dict = typeof nsAdminModeration.fr;

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

export function roomLabel(
  m: Pick<
    AdminLibraryChatMessage,
    'roomKind' | 'roomName' | 'roomOwnerNickname'
  >,
  t: Dict
): string {
  if (m.roomName) return m.roomName;
  switch (m.roomKind) {
    case 'hall':
      return t.chatRoomHall;
    case 'team_hq':
      return t.chatRoomTeamHq;
    case 'apartment':
      return m.roomOwnerNickname
        ? format(t.chatRoomApartmentOf, { name: m.roomOwnerNickname })
        : t.chatRoomApartment;
    default:
      return t.chatRoomUnknown;
  }
}

export default function LibraryChatMessagesPanel() {
  const t = useAdminT(nsAdminModeration);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const {
    query: messages,
    items,
    unfilteredItems,
    roomId,
    setRoomId,
    mutingId,
    setMutingId,
  } = useLibraryChatMessages();
  const hide = useHideLibraryChatMessage();

  // Le filtre propose les salles déjà vues (toutes salles confondues, lues
  // dans la liste non filtrée en cache), et garde la salle choisie même quand
  // on la regarde seule.
  const rooms = useMemo(
    () => roomsOf([...unfilteredItems, ...items]),
    [unfilteredItems, items]
  );

  async function onHide(m: AdminLibraryChatMessage) {
    const ok = await confirm({
      title: t.chatConfirmHideTitle,
      subtitle: t.chatConfirmHideSubtitle,
      variant: 'warning',
      confirmLabel: t.chatConfirmHideLabel,
    });
    if (!ok) return;
    try {
      const res = await hide.mutateAsync(m.id);
      addToast(
        res.alreadyHidden ? t.chatAlreadyHidden : t.chatHidden,
        'success'
      );
    } catch (err) {
      addToast(adminErrorMessage(err, t.chatErrorHide), 'error');
    }
  }

  return (
    <section aria-labelledby="library-chat-messages-heading" className="mb-10">
      {dialog}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <h3
          id="library-chat-messages-heading"
          className="text-lg font-semibold text-neutral-100"
        >
          {t.chatMessagesHeading}
        </h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            {t.chatRoomFilter}
            <select
              value={roomId ?? ''}
              onChange={(e) => setRoomId(e.target.value || null)}
              className="min-h-9 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-2 text-sm text-neutral-100"
            >
              <option value="">{t.chatRoomAll}</option>
              {rooms.map((r) => (
                <option key={r.roomId} value={r.roomId}>
                  {roomLabel(r, t)}
                </option>
              ))}
            </select>
          </label>
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={() => void messages.refetch()}
            disabled={messages.isFetching}
          >
            {t.chatRefresh}
          </AdminButton>
        </div>
      </div>

      {messages.isPending ? (
        <LoadingSpinner className="py-12" label={t.chatLoading} />
      ) : messages.isError ? (
        <div className="space-y-3">
          <AlertBanner
            message={adminErrorMessage(messages.error, t.chatLoadError)}
          />
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={() => void messages.refetch()}
          >
            {t.chatRetry}
          </AdminButton>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t.chatEmptyTitle}
          description={t.chatEmptyDescription}
        />
      ) : (
        <>
          <ol
            aria-label={t.chatMessagesCaption}
            className="divide-y divide-[var(--line,rgba(194,196,201,.12))] rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]"
          >
            {items.map((m) => {
              const name = m.nickname ?? m.userId;
              const muting = mutingId === m.id;
              return (
                <li
                  key={m.id}
                  data-testid="library-chat-row"
                  data-hidden={m.hiddenAt ? '' : undefined}
                  className="px-4 py-3"
                >
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-sm">
                    <time
                      dateTime={m.createdAt}
                      className="whitespace-nowrap text-neutral-400"
                    >
                      {formatTime(m.createdAt)}
                    </time>
                    <span className="text-neutral-400">{roomLabel(m, t)}</span>
                    <span
                      className="font-medium text-neutral-100"
                      title={m.userId}
                    >
                      {m.nickname ?? (
                        <span className="italic text-neutral-400">
                          {t.chatNoAvatar}
                        </span>
                      )}
                    </span>
                    {m.hiddenAt ? (
                      <Chip tone="warn">{t.chatHiddenTag}</Chip>
                    ) : null}
                    <span className="ml-auto flex gap-2">
                      {!m.hiddenAt && (
                        <AdminButton
                          variant="ghost"
                          size="xs"
                          aria-label={format(t.chatHideAria, { name })}
                          onClick={() => void onHide(m)}
                          disabled={hide.isPending}
                        >
                          {t.chatHide}
                        </AdminButton>
                      )}
                      <AdminButton
                        variant="ghost"
                        size="xs"
                        aria-label={format(t.chatMuteAria, { name })}
                        aria-expanded={muting}
                        onClick={() => setMutingId(muting ? null : m.id)}
                      >
                        {t.chatMute}
                      </AdminButton>
                    </span>
                  </div>
                  <p
                    className={`mt-1 whitespace-pre-wrap break-words text-sm ${
                      m.hiddenAt
                        ? 'text-neutral-500 line-through'
                        : 'text-neutral-200'
                    }`}
                  >
                    {m.body}
                  </p>
                  {muting && (
                    <LibraryChatMuteForm
                      message={m}
                      onClose={() => setMutingId(null)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          {messages.hasNextPage && (
            <div className="mt-3">
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => void messages.fetchNextPage()}
                disabled={messages.isFetchingNextPage}
              >
                {t.chatLoadMore}
              </AdminButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
