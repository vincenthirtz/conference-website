// components/admin/moderation/LibraryBansPanel.tsx
// Onglet « Library » du hub /admin/moderation : bannir de la Women's Library
// (lot 5 de docs/PLAN-womens-library.md) et lever un bannissement.
//
// Endpoints (conference-api, permission `moderate_support`) :
//   GET    /api/admin/library/bans?active=true  → { items, total }
//   POST   /api/admin/library/bans              → 201 { ban }
//   DELETE /api/admin/library/bans?userId=      → { userId, lifted }
//   DELETE /api/admin/library/bans?id=          → { userId, lifted }
//
// Le bannissement s'applique SANS RECHARGER côté joueuses : l'API le diffuse
// sur le sujet temps réel de l'espace. Lever ne diffuse rien : la joueuse
// retrouve l'accès à sa prochaine entrée.
//
// COMPTE SUPPRIMÉ (lot 14b) : la ligne reste, `userId` à `null` — le
// bannissement continue de refuser un nouveau compte qui reprend ses
// identifiants (empreintes hachées, jamais montrées ici). Elle se lève par son
// `id`, faute de compte à désigner.
//
// « Par » : la route ne rend que l'identifiant du membre du staff (pas de nom),
// et l'onglet ne doit pas exiger un droit de plus pour lire l'annuaire du staff.

import { useRef } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminModerationLibrary from '@/lib/i18n/locales/admin-fr/adminModerationLibrary';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import AlertBanner from '@/components/admin/AlertBanner';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import {
  useActiveLibraryBans,
  useLiftLibraryBans,
} from '@/features/admin/library/hooks/useLibraryBans';
import type { LibraryBanItem } from '@/features/admin/library/model';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import LibraryBanForm from './LibraryBanForm';

type Dict = typeof nsAdminModerationLibrary.fr;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function byLabel(
  ban: LibraryBanItem,
  currentStaffId: string | undefined,
  t: Dict
): string {
  if (!ban.byStaffId) return t.libByFormerStaff;
  if (currentStaffId && ban.byStaffId === currentStaffId) return t.libByYou;
  return `${ban.byStaffId.slice(0, 8)}…`;
}

export default function LibraryBansPanel({
  currentStaffId,
}: {
  /** Pour écrire « Vous » sur les bannissements qu'on a soi-même décidés. */
  currentStaffId?: string;
}) {
  const t = useAdminT(nsAdminModerationLibrary);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const bans = useActiveLibraryBans();
  const lift = useLiftLibraryBans();
  const listHeadingRef = useRef<HTMLHeadingElement>(null);

  const items = bans.data?.items ?? [];
  const total = bans.data?.total ?? items.length;

  async function copyUserId(userId: string) {
    try {
      await navigator.clipboard.writeText(userId);
      addToast(t.libCopied, 'success');
    } catch {
      addToast(t.libCopyFailed, 'error');
    }
  }

  async function onLift(ban: LibraryBanItem) {
    const name = ban.nickname ?? ban.userId ?? t.libAccountDeleted;
    const ok = await confirm({
      title: t.libConfirmLiftTitle,
      subtitle: ban.userId
        ? format(t.libConfirmLiftSubtitle, { name })
        : t.libConfirmLiftDeletedSubtitle,
      variant: 'warning',
      confirmLabel: t.libConfirmLiftLabel,
    });
    if (!ok) return;
    try {
      const res = await lift.mutateAsync(
        ban.userId ? { userId: ban.userId } : { id: ban.id }
      );
      if (res.lifted > 0) addToast(format(t.libLifted, { name }), 'success');
      else addToast(t.libLiftedNone, 'info');
      // La ligne disparaît avec son bouton : le focus revient sur la liste.
      listHeadingRef.current?.focus();
    } catch (err) {
      addToast(adminErrorMessage(err, t.libErrorLift), 'error');
    }
  }

  return (
    <>
      {dialog}

      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">{t.libHeading}</h2>
        <p className="text-sm text-neutral-400 mt-1">{t.libSubtitle}</p>
      </div>

      <LibraryBanForm t={t} />

      <section aria-labelledby="library-bans-list-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3
            id="library-bans-list-heading"
            ref={listHeadingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-neutral-100 focus:outline-none"
          >
            {t.libListHeading}
          </h3>
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={() => void bans.refetch()}
            disabled={bans.isFetching}
          >
            {t.libRefresh}
          </AdminButton>
        </div>

        {bans.isPending ? (
          <LoadingSpinner className="py-16" label={t.libLoading} />
        ) : bans.isError ? (
          <div className="space-y-3">
            <AlertBanner
              message={adminErrorMessage(bans.error, t.libLoadError)}
            />
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => void bans.refetch()}
            >
              {t.libRetry}
            </AdminButton>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={t.libEmptyTitle}
            description={t.libEmptyDescription}
          />
        ) : (
          <>
            <p className="text-xs text-neutral-500 mb-2">
              {format(total > 1 ? t.libCount_other : t.libCount_one, {
                total,
              })}
              {total > items.length
                ? ` ${format(t.libShownOf, { shown: items.length, total })}`
                : null}
            </p>
            <div className="overflow-x-auto rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
              <table className="w-full text-sm">
                <caption className="sr-only">{t.libListCaption}</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t.libColPlayer}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t.libColAccount}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t.libColReason}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t.libColUntil}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t.libColBy}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t.libColCreated}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      <span className="sr-only">{t.libColActions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
                  {items.map((ban) => {
                    const userId = ban.userId;
                    const name = ban.nickname ?? userId ?? t.libAccountDeleted;
                    // La levée en cours vise CETTE joueuse (ou ce
                    // bannissement, compte supprimé) : lu sur la mutation.
                    const pending = lift.isPending ? lift.variables : undefined;
                    const busy =
                      pending !== undefined &&
                      ('userId' in pending
                        ? pending.userId === userId
                        : pending.id === ban.id);
                    return (
                      <tr
                        key={ban.id}
                        data-testid="library-ban-row"
                        className="align-top"
                      >
                        <th
                          scope="row"
                          className="px-4 py-3 text-left font-medium text-neutral-100"
                        >
                          {ban.nickname ?? (
                            <span className="italic text-neutral-400">
                              {userId ? t.libNoAvatar : t.libAccountDeleted}
                            </span>
                          )}
                        </th>
                        <td className="px-4 py-3">
                          {userId ? (
                            <div className="flex items-center gap-2">
                              <code className="font-mono text-xs text-neutral-300 break-all">
                                {userId}
                              </code>
                              <AdminButton
                                variant="ghost"
                                size="xs"
                                aria-label={format(t.libCopyAria, { name })}
                                onClick={() => void copyUserId(userId)}
                              >
                                {t.libCopy}
                              </AdminButton>
                            </div>
                          ) : (
                            // Le nom « Compte supprimé » est déjà en tête de
                            // ligne : ici, ce que le bannissement fait encore.
                            <p className="max-w-xs text-xs text-neutral-500">
                              {t.libAccountDeletedHint}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-300 whitespace-pre-line">
                          {ban.reason ?? (
                            <span className="italic text-neutral-500">
                              {t.libNoReason}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {ban.until ? (
                            <time dateTime={ban.until}>
                              {formatDate(ban.until)}
                            </time>
                          ) : (
                            <Chip tone="err">{t.libPermanent}</Chip>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 whitespace-nowrap text-neutral-400"
                          title={ban.byStaffId ?? undefined}
                        >
                          {byLabel(ban, currentStaffId, t)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-neutral-400">
                          <time dateTime={ban.createdAt}>
                            {formatDate(ban.createdAt)}
                          </time>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <AdminButton
                            variant="danger"
                            size="xs"
                            aria-label={format(t.libLiftAria, { name })}
                            onClick={() => void onLift(ban)}
                            disabled={busy}
                          >
                            {t.libLift}
                          </AdminButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
