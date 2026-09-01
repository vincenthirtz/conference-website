// pages/admin/free-players.tsx
//
// Écran staff du marché des joueuses libres (lot 1 acquisition).
//
// POURQUOI cet écran alors que chaque joueuse a son lien de retrait par email :
// elle peut avoir perdu l'email, changé d'adresse, ou demander le retrait par
// Discord. Une donnée publiée doit avoir deux portes de sortie — la sienne et
// celle de l'opérateur qu'elle sollicite. C'est aussi la seule vue qui montre
// les DEUX provenances au même endroit.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminFreePlayers from '@/lib/i18n/locales/admin-fr/adminFreePlayers';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import type { StaffProps } from '@/types/admin';

export const getServerSideProps = withStaffPage({ permission: 'manage_teams' });

type Item = {
  id: string;
  source: 'web' | 'discord';
  name: string | null;
  roles: string[];
  level: string | null;
  availability: string | null;
  note: string | null;
  contactEmail: string | null;
  contactDiscord: string | null;
  discordUsername: string | null;
  markedAt: string | null;
  expiresAt: string | null;
};

export default function AdminFreePlayersPage(_props: StaffProps) {
  const t = useAdminT(nsAdminFreePlayers);
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  /** Libellés du kit de listes (lot A5) — traduits ici, pas dans le composant. */
  const tableLabels = {
    search: t.searchPlaceholder,
    empty: t.empty,
    export: t.exportCsv,
    selected: t.selectedCount,
    selectAll: t.selectAll,
    selectRow: t.selectRow,
    previous: t.previousPage,
    next: t.nextPage,
    page: t.pageOf,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await adminFetchJson<{ items: Item[] }>(
        '/api/admin/free-players'
      );
      setItems(data.items ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRemove = async (item: Item) => {
    const ok = await confirm({
      title: t.confirmTitle,
      // Le staff doit savoir AVANT de cliquer qu'un retrait Discord n'est pas
      // durable — sinon il le découvre 30 minutes plus tard, en la revoyant.
      subtitle:
        item.source === 'discord' ? t.confirmBodyDiscord : t.confirmBody,
      variant: 'danger',
      confirmLabel: t.confirmCta,
      cancelLabel: t.cancel,
    });
    if (!ok) return;

    setRemoving(item.id);
    try {
      const res = await adminFetchJson<{ willReturn?: boolean }>(
        `/api/admin/free-players?id=${encodeURIComponent(item.id)}`,
        { method: 'DELETE' }
      );
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      addToast(res?.willReturn ? t.removedWillReturn : t.removed, 'success');
    } catch {
      addToast(t.removeError, 'error');
    } finally {
      setRemoving(null);
    }
  };

  // Lot A5 : colonnes DÉCLARATIVES. `value` sert à la fois au tri, à la
  // recherche et à l'export CSV — l'export cesse d'être une seconde
  // description des mêmes données, qui dérive de la première.
  const columns: DataTableColumn<Item>[] = [
    {
      key: 'name',
      header: t.colName,
      value: (i) => i.name || t.noName,
      className: 'font-medium text-white',
    },
    {
      key: 'roles',
      header: t.colRoles,
      value: (i) => (i.roles.length > 0 ? i.roles.join(', ') : ''),
    },
    { key: 'level', header: t.colLevel, value: (i) => i.level ?? '' },
    {
      key: 'availability',
      header: t.colAvailability,
      value: (i) => i.availability ?? '',
      className: 'max-w-xs',
    },
    {
      key: 'contact',
      header: t.colContact,
      value: (i) =>
        i.contactEmail ?? (i.discordUsername ? `@${i.discordUsername}` : ''),
      render: (i) =>
        i.contactEmail ? (
          <a
            href={`mailto:${i.contactEmail}`}
            className="text-purple-300 underline underline-offset-2"
          >
            {i.contactEmail}
          </a>
        ) : i.discordUsername ? (
          <span className="font-mono text-xs">@{i.discordUsername}</span>
        ) : (
          <>{t.noContact}</>
        ),
    },
    {
      key: 'source',
      header: t.colSource,
      value: (i) => (i.source === 'web' ? t.sourceWeb : t.sourceDiscord),
    },
    {
      key: 'since',
      header: t.colSince,
      // Trié sur l'ISO, affiché en date locale : trier une date affichée
      // « 03/09 » la classerait alphabétiquement.
      value: (i) => i.markedAt ?? '',
      render: (i) => (
        <>
          {i.markedAt ? new Date(i.markedAt).toLocaleDateString('fr-FR') : '—'}
        </>
      ),
    },
    {
      key: 'actions',
      header: t.colActions,
      sortable: false,
      render: (i) => (
        <button
          type="button"
          onClick={() => void handleRemove(i)}
          disabled={removing === i.id}
          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          {removing === i.id ? t.removing : t.remove}
        </button>
      ),
    },
  ];

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 pt-20 pb-12 sm:px-6 lg:px-8">
          <div className="mb-6">
            <p className="text-sm text-neutral-400">{t.eyebrow}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
              {t.heading}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-neutral-400">{t.intro}</p>
            <p className="mt-2 max-w-3xl text-xs text-neutral-500">
              {t.selfServiceNote}
            </p>
          </div>

          {!loading && !error && items.length > 0 && (
            <p className="mb-3 text-sm text-neutral-400">
              {format(t.count, { count: items.length })}
            </p>
          )}

          <DataTable<Item>
            rows={items}
            columns={columns}
            rowKey={(i) => i.id}
            loading={loading}
            error={error ? t.loadError : null}
            onRetry={() => void load()}
            emptyTitle={t.empty}
            searchPlaceholder={t.searchPlaceholder}
            exportFilename="joueuses-libres"
            labels={tableLabels}
          />
        </div>
      </div>
      {dialog}
    </>
  );
}
