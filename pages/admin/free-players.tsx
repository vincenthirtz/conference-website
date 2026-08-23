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
import type { StaffProps } from '@/types/admin';

export const getServerSideProps = withStaffPage('admin');

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

  const th = 'px-3 py-2 text-left text-xs font-semibold text-neutral-400';
  const td = 'px-3 py-2 align-top text-sm text-neutral-200';

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

          {loading && <p className="text-sm text-neutral-400">{t.loading}</p>}

          {!loading && error && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            >
              {t.loadError}
              <button
                type="button"
                onClick={() => void load()}
                className="ml-3 underline underline-offset-2"
              >
                {t.retry}
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="text-sm text-neutral-400">{t.empty}</p>
          )}

          {!loading && !error && items.length > 0 && (
            <>
              <p className="mb-3 text-sm text-neutral-400">
                {format(t.count, { count: items.length })}
              </p>
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
                <table className="min-w-full">
                  <thead className="border-b border-white/10">
                    <tr>
                      <th className={th}>{t.colName}</th>
                      <th className={th}>{t.colRoles}</th>
                      <th className={th}>{t.colLevel}</th>
                      <th className={th}>{t.colAvailability}</th>
                      <th className={th}>{t.colContact}</th>
                      <th className={th}>{t.colSource}</th>
                      <th className={th}>{t.colSince}</th>
                      <th className={th}>{t.colActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className={`${td} font-medium text-white`}>
                          {item.name || t.noName}
                        </td>
                        <td className={td}>
                          {item.roles.length > 0 ? item.roles.join(', ') : '—'}
                        </td>
                        <td className={td}>{item.level || '—'}</td>
                        <td className={`${td} max-w-xs`}>
                          {item.availability || '—'}
                        </td>
                        <td className={td}>
                          {item.contactEmail ? (
                            <a
                              href={`mailto:${item.contactEmail}`}
                              className="text-purple-300 underline underline-offset-2"
                            >
                              {item.contactEmail}
                            </a>
                          ) : item.discordUsername ? (
                            <span className="font-mono text-xs">
                              @{item.discordUsername}
                            </span>
                          ) : (
                            t.noContact
                          )}
                        </td>
                        <td className={td}>
                          {item.source === 'web' ? t.sourceWeb : t.sourceDiscord}
                        </td>
                        <td className={td}>
                          {item.markedAt
                            ? new Date(item.markedAt).toLocaleDateString('fr-FR')
                            : '—'}
                        </td>
                        <td className={td}>
                          <button
                            type="button"
                            onClick={() => void handleRemove(item)}
                            disabled={removing === item.id}
                            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
                          >
                            {removing === item.id ? t.removing : t.remove}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {dialog}
    </>
  );
}
