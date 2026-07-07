import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Dict = ReturnType<typeof useAdminT<'adminPartnersList'>>;

type PartnerRow = {
  id: string;
  name: string;
  description: string;
  category: 'super' | 'major' | 'cultural';
  logo_url: string | null;
  website_url: string | null;
  note: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type PartnersApiResponse = {
  items: PartnerRow[];
  total: number | null;
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

const P_FILTER_KEYS = ['category', 'active', 'search'] as const;

const PAGE_LIMIT = 50;

const getCategoryLabels = (tx: Dict): Record<string, string> => ({
  super: tx.categorySuper,
  major: tx.categoryMajor,
  cultural: tx.categoryCultural,
});

const categoryColors: Record<string, string> = {
  super: 'bg-amber-600 text-white',
  major: 'bg-purple-600 text-white',
  cultural: 'bg-emerald-600 text-white',
};

function AdminPartnersPage(_props: Props) {
  const tx = useAdminT('adminPartnersList');
  const categoryLabels = getCategoryLabels(tx);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { filters, setFilters } = useUrlFilters(P_FILTER_KEYS);

  const categoryFilter = filters.category ?? '';
  const activeFilter = filters.active ?? '';
  const searchFilter = filters.search ?? '';

  // Champ de recherche local (debounce → query param `search`)
  const [searchInput, setSearchInput] = useState(searchFilter);

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Garde le champ local en phase si l'URL change (navigation, partage de lien)
  useEffect(() => {
    setSearchInput(searchFilter);
  }, [searchFilter]);

  // Debounce ~300ms : propage la saisie vers le query param `search`
  useEffect(() => {
    if (searchInput === searchFilter) return;
    const t = setTimeout(() => {
      setOffset(0);
      setFilters({ search: searchInput.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Tout changement de filtre serveur revient à la première page
  useEffect(() => {
    setOffset(0);
  }, [categoryFilter, activeFilter, searchFilter]);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_LIMIT));
      params.set('offset', String(offset));
      params.set('includeTotal', '1');
      if (categoryFilter) params.set('category', categoryFilter);
      if (activeFilter) params.set('active', activeFilter);
      if (searchFilter) params.set('search', searchFilter);

      const json = await adminFetchJson<PartnersApiResponse>(
        '/api/admin/partners?' + params.toString()
      );
      setPartners(json.items || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || tx.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, offset, categoryFilter, activeFilter, searchFilter, tx]);

  // Re-fetch à chaque changement de filtre serveur / pagination
  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const onDelete = async (id: string) => {
    const ok = await confirm({
      title: tx.deleteConfirmTitle,
      variant: 'danger',
      confirmLabel: tx.delete,
    });
    if (!ok) return;
    try {
      await adminFetchJson(`/api/admin/partners/${id}`, { method: 'DELETE' });
      fetchPartners();
    } catch (err: unknown) {
      addToast((err as Error)?.message || tx.errorDelete, 'error');
    }
  };

  const toggleActive = async (partner: PartnerRow) => {
    try {
      await adminFetchJson(`/api/admin/partners/${partner.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !partner.is_active }),
      });
      fetchPartners();
    } catch (err: unknown) {
      addToast((err as Error)?.message || tx.errorUpdate, 'error');
    }
  };

  const showingFrom = partners.length > 0 ? offset + 1 : 0;
  const showingTo = offset + partners.length;

  return (
    <>
      {dialog}
      <Head>
        <title>{tx.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {tx.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total !== null
                    ? format(total > 1 ? tx.count_other : tx.count_one, {
                        count: total,
                      })
                    : tx.loading}
                </p>
              </div>

              <Link
                href="/admin/partners/new"
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                {tx.newButton}
              </Link>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {errorMsg}
            </div>
          )}

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <div className="flex gap-4 flex-wrap items-end">
              <div className="min-w-[180px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {tx.categoryLabel}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={categoryFilter}
                  onChange={(e) =>
                    setFilters({ category: e.target.value || null })
                  }
                >
                  <option value="">{tx.categoryAll}</option>
                  <option value="super">{tx.categorySuper}</option>
                  <option value="major">{tx.categoryMajor}</option>
                  <option value="cultural">{tx.categoryCultural}</option>
                </select>
              </div>

              <div className="min-w-[160px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {tx.statusLabel}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={activeFilter}
                  onChange={(e) =>
                    setFilters({ active: e.target.value || null })
                  }
                >
                  <option value="">{tx.statusAll}</option>
                  <option value="true">{tx.statusActive}</option>
                  <option value="false">{tx.statusInactive}</option>
                </select>
              </div>

              <div className="min-w-[220px] flex-1">
                <label className="block text-sm text-neutral-400 mb-1">
                  {tx.searchLabel}
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder={tx.searchPlaceholder}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Partners List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : partners.length === 0 ? (
              <div className="text-center py-20 text-neutral-400">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-neutral-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                {tx.emptyState}
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {partners.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-4 p-4 hover:bg-neutral-700/30 transition-colors group ${
                      !p.is_active ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Logo or icon */}
                    <div className="flex-shrink-0">
                      {p.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.logo_url}
                          alt={p.name}
                          className="w-12 h-12 rounded-xl border border-neutral-700 object-cover bg-white/5"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                          <svg
                            className="w-6 h-6 text-neutral-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                          {p.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            categoryColors[p.category]
                          }`}
                        >
                          {categoryLabels[p.category]}
                        </span>
                        {p.note && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                            {p.note}
                          </span>
                        )}
                        {!p.is_active && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-600 text-neutral-300">
                            {tx.statusInactive}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-400 truncate">
                        {p.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                        <span>
                          {format(tx.order, { order: p.display_order })}
                        </span>
                        {p.website_url && (
                          <>
                            <span>•</span>
                            <a
                              href={p.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-blue-400 transition"
                            >
                              {tx.website}
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(p)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                          p.is_active
                            ? 'border-amber-500/40 text-amber-300 hover:border-amber-400'
                            : 'border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
                        }`}
                      >
                        {p.is_active ? tx.deactivate : tx.activate}
                      </button>
                      <Link
                        href={`/admin/partners/${p.id}`}
                        className="px-3 py-1.5 rounded-lg border border-neutral-600 hover:border-neutral-500 text-sm transition-colors"
                      >
                        {tx.edit}
                      </Link>
                      <button
                        onClick={() => onDelete(p.id)}
                        className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                      >
                        {tx.delete}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          {partners.length > 0 && (
            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                {tx.previous}
              </button>

              <span className="text-neutral-400 text-sm">
                {showingFrom} – {showingTo}
                {total !== null ? format(tx.paginationOf, { total }) : ''}
              </span>

              <button
                type="button"
                disabled={total !== null && offset + PAGE_LIMIT >= total}
                onClick={() => setOffset(offset + PAGE_LIMIT)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {tx.next}
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminPartnersPage;
