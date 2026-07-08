import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  default_locale: string | null;
  guild_count: number;
  staff_count: number;
  created_at: string;
};

type TenantsResponse = {
  tenants: TenantRow[];
};

type PendingLink = {
  guild_id: string;
  guild_name: string | null;
};

type PendingLinksResponse = {
  links: PendingLink[];
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

function AdminTenantsListPage(_props: Props) {
  const t = useAdminT('adminTenantsList');
  const { adminFetchJson } = useAdminFetch();
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [pending, setPending] = useState<PendingLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [t, p] = await Promise.all([
        adminFetchJson<TenantsResponse>('/api/admin/tenants'),
        adminFetchJson<PendingLinksResponse>(
          '/api/admin/pending-guild-links'
        ).catch(() => ({ links: [] }) as PendingLinksResponse),
      ]);
      setTenants(t.tenants || []);
      setPending(p.links || []);
    } catch (err) {
      logger.error('AdminTenantsListPage: fetch error', err);
      setError((err as Error)?.message || t.errorLoad);
    }
  }, [adminFetchJson, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const visible = useMemo(() => {
    if (!tenants) return [];
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (filter === 'active' && !t.is_active) return false;
      if (filter === 'archived' && t.is_active) return false;
      if (!q) return true;
      return (
        t.slug.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
      );
    });
  }, [tenants, search, filter]);

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbTenants },
            ]}
          />

          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {t.heading}
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                {tenants
                  ? format(
                      tenants.length > 1
                        ? t.countTenants_other
                        : t.countTenants_one,
                      { count: tenants.length }
                    )
                  : t.loading}
              </p>
            </div>

            <Link
              href="/admin/tenants/new"
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors inline-flex items-center gap-2"
              data-testid="tenants-create-cta"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {t.createTenant}
            </Link>
          </div>

          {pending.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-center justify-between gap-3">
              <span>
                <strong>{pending.length}</strong>
                {pending.length > 1 ? t.pendingText_other : t.pendingText_one}
              </span>
              <Link
                href="/admin/onboarding?tab=guild-links"
                className="px-3 py-1.5 rounded-lg border border-amber-400/40 hover:border-amber-300 text-amber-100 text-xs font-medium transition-colors"
              >
                {t.pendingViewQueue}
              </Link>
            </div>
          )}

          <AlertBanner message={error} className="mb-4" />

          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 mb-6 flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex gap-1 rounded-xl bg-neutral-900/50 p-1 text-xs">
              {(['all', 'active', 'archived'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFilter(opt)}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    filter === opt
                      ? 'bg-purple-600 text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {opt === 'all'
                    ? t.filterAll
                    : opt === 'active'
                      ? t.filterActive
                      : t.filterArchived}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {tenants === null ? (
              <div className="py-16">
                <LoadingSpinner label={t.loadingTenants} />
              </div>
            ) : visible.length === 0 ? (
              <EmptyState
                title={t.emptyTitle}
                description={
                  tenants.length === 0 ? t.emptyDescNone : t.emptyDescFilter
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">{t.colSlug}</th>
                      <th className="px-4 py-3 text-left">{t.colName}</th>
                      <th className="px-4 py-3 text-left">{t.colStatus}</th>
                      <th className="px-4 py-3 text-left">{t.colGuilds}</th>
                      <th className="px-4 py-3 text-left">{t.colStaff}</th>
                      <th className="px-4 py-3 text-left">{t.colCreated}</th>
                      <th className="px-4 py-3 text-right">{t.colActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {visible.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-neutral-700/30 transition-colors"
                        data-testid={`tenant-row-${row.slug}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-purple-300">
                          {row.slug}
                        </td>
                        <td className="px-4 py-3 font-medium text-white">
                          {row.name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              row.is_active
                                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-neutral-700/40 text-neutral-400 border border-neutral-600/40'
                            }`}
                          >
                            {row.is_active ? t.statusActive : t.statusArchived}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-neutral-300">
                          {row.guild_count}
                        </td>
                        <td className="px-4 py-3 text-neutral-300">
                          {row.staff_count}
                        </td>
                        <td className="px-4 py-3 text-neutral-400 text-xs">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/admin/tenants/${row.id}`}
                              className="px-3 py-1.5 rounded-lg border border-neutral-600 hover:border-neutral-500 text-sm transition-colors"
                            >
                              {t.edit}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('manager');

export default AdminTenantsListPage;
