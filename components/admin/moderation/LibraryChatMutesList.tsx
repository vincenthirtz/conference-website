// components/admin/moderation/LibraryChatMutesList.tsx
// Onglet « Library » du hub /admin/moderation : les SOURDINES EN COURS du chat
// de la Women's Library (lot 6), et leur levée (journalisée ; la joueuse en
// est avertie et peut écrire de nouveau tout de suite).
//
//   GET    /api/admin/library/mutes      → { items }
//   DELETE /api/admin/library/mutes?id=  → { id, lifted }

import { useRef } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminModerationLibrary from '@/lib/i18n/locales/admin-fr/adminModerationLibrary';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import {
  useLiftLibraryChatMute,
  useLibraryChatMutes,
} from '@/features/admin/library/hooks/useLibraryChatModeration';
import type { AdminLibraryMuteItem } from '@/features/admin/library/chatModel';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import { roomLabel } from './LibraryChatMessagesPanel';

function formatDate(value: string): string {
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

export default function LibraryChatMutesList() {
  const t = useAdminT(nsAdminModerationLibrary);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const mutes = useLibraryChatMutes();
  const lift = useLiftLibraryChatMute();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const items = mutes.data?.items ?? [];

  async function onLift(m: AdminLibraryMuteItem) {
    const name = m.nickname ?? m.userId;
    const ok = await confirm({
      title: t.chatConfirmLiftTitle,
      subtitle: format(t.chatConfirmLiftSubtitle, { name }),
      variant: 'warning',
      confirmLabel: t.chatConfirmLiftLabel,
    });
    if (!ok) return;
    try {
      const res = await lift.mutateAsync(m.id);
      addToast(
        res.lifted ? format(t.chatLifted, { name }) : t.chatLiftedNone,
        res.lifted ? 'success' : 'info'
      );
      headingRef.current?.focus();
    } catch (err) {
      addToast(adminErrorMessage(err, t.chatErrorLift), 'error');
    }
  }

  return (
    <section aria-labelledby="library-chat-mutes-heading" className="mb-10">
      {dialog}
      <h3
        id="library-chat-mutes-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mb-3 text-lg font-semibold text-neutral-100 focus:outline-none"
      >
        {t.chatMutesHeading}
      </h3>
      {mutes.isPending ? (
        <LoadingSpinner className="py-8" label={t.chatLoading} />
      ) : mutes.isError ? (
        <AlertBanner
          message={adminErrorMessage(mutes.error, t.chatMutesLoadError)}
        />
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-400">{t.chatMutesEmpty}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
          <table className="w-full text-sm">
            <caption className="sr-only">{t.chatMutesCaption}</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                <th scope="col" className="px-4 py-3 font-medium">
                  {t.chatColPlayer}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t.chatColWhere}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t.chatColUntil}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t.chatColReason}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  <span className="sr-only">{t.chatColActions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
              {items.map((m) => {
                const name = m.nickname ?? m.userId;
                // La levée en cours vise CETTE sourdine : lu sur la mutation.
                const busy = lift.isPending && lift.variables === m.id;
                return (
                  <tr
                    key={m.id}
                    data-testid="library-chat-mute-row"
                    className="align-top"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 text-left font-medium text-neutral-100"
                      title={m.userId}
                    >
                      {m.nickname ?? (
                        <span className="italic text-neutral-400">
                          {t.chatNoAvatar}
                        </span>
                      )}
                    </th>
                    <td className="px-4 py-3 text-neutral-300">
                      {m.roomId
                        ? roomLabel(
                            {
                              roomKind: m.roomKind ?? 'unknown',
                              roomName: null,
                              roomOwnerNickname: null,
                            },
                            t
                          )
                        : t.chatMuteEverywhere}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <time dateTime={m.until}>{formatDate(m.until)}</time>
                    </td>
                    <td className="px-4 py-3 text-neutral-300 whitespace-pre-line">
                      {m.reason ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AdminButton
                        variant="danger"
                        size="xs"
                        aria-label={format(t.chatLiftAria, { name })}
                        onClick={() => void onLift(m)}
                        disabled={busy}
                      >
                        {t.chatLift}
                      </AdminButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
