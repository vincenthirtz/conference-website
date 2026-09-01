import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage, hasAtLeastRole } from '@/utils/staff';
import type { StaffRole } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import Th from '@/components/admin/Th';
import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import TenantFormModal from '@/components/admin/tenants/TenantFormModal';
import PlanCheckoutModal from '@/components/admin/tenants/PlanCheckoutModal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { PLAN_LABELS, type TenantPlan } from '@/utils/billing/planFeatures';
import nsAdminTenantsList from '@/lib/i18n/locales/admin-fr/adminTenantsList';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  default_locale: string | null;
  guild_count: number;
  staff_count: number;
  created_at: string;
  plan: TenantPlan | null;
  plan_status: string | null;
  plan_expires_at: string | null;
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

function planStatusLabel(
  t: Record<string, string>,
  status: string | null
): string {
  switch (status) {
    case 'active':
      return t.planStatusActive;
    case 'past_due':
      return t.planStatusPastDue;
    case 'canceled':
      return t.planStatusCanceled;
    default:
      return status ?? '';
  }
}

// Teinte du badge plan selon l'entitlement : vert = actif, ambre = past_due,
// gris = annulé.
function planBadgeClass(status: string | null): string {
  switch (status) {
    case 'past_due':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'canceled':
      return 'bg-neutral-700/40 text-neutral-400 border-neutral-600/40';
    default:
      return 'bg-purple-600/15 text-purple-300 border-purple-500/30';
  }
}

function AdminTenantsListPage({ staff }: Props) {
  const t = useAdminT(nsAdminTenantsList);
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const [pending, setPending] = useState<PendingLink[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [checkoutTenant, setCheckoutTenant] = useState<TenantRow | null>(null);

  // Miroir UX du gate serveur : seul un owner peut générer un lien de paiement
  // (POST /plan-checkout est withStaffRoute('owner')). L'API reste la vraie
  // barrière ; ici on désactive l'action + hint pour éviter le faux espoir.
  const isOwner = hasAtLeastRole(staff.role as StaffRole, 'owner');

  // Liste globale des tenants (visibilité manager+). L'endpoint ne pagine pas
  // et ne renvoie pas de total → `includeTotal: false` ; le filtrage
  // search/statut reste 100 % client (voir `visible`).
  const {
    data: tenants,
    loading,
    error,
    refresh: refreshTenants,
  } = useAdminResource<TenantRow, TenantsResponse>('/api/admin/tenants', {
    includeTotal: false,
    select: (res) => res.tenants || [],
  });

  // Les liens Discord en attente vivent sur un endpoint distinct (owner-only) ;
  // chargé en parallèle et dégradé silencieusement (403 manager → 0 lien).
  const fetchPending = useCallback(async () => {
    const p = await adminFetchJson<PendingLinksResponse>(
      '/api/admin/pending-guild-links'
    ).catch(() => ({ links: [] }) as PendingLinksResponse);
    setPending(p.links || []);
  }, [adminFetchJson]);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  // Après création d'un tenant : rafraîchir la liste ET la file d'attente
  // (une création peut consommer un lien en attente).
  const refreshAll = useCallback(() => {
    refreshTenants();
    void fetchPending();
  }, [refreshTenants, fetchPending]);

  // Deep-link : `?new=1` (ancienne route /new) ouvre la modale de création.
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.new) setModalOpen(true);
  }, [router.isReady, router.query.new]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    if (router.query.new) {
      const { new: _omit, ...rest } = router.query;
      void router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true }
      );
    }
  }, [router]);

  const visible = useMemo(() => {
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

      <TenantFormModal
        open={modalOpen}
        onClose={closeModal}
        onCreated={refreshAll}
      />

      {checkoutTenant && (
        <PlanCheckoutModal
          tenant={checkoutTenant}
          onClose={() => setCheckoutTenant(null)}
        />
      )}

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
                {loading
                  ? t.loading
                  : format(
                      tenants.length > 1
                        ? t.countTenants_other
                        : t.countTenants_one,
                      { count: tenants.length }
                    )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
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
            </button>
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
              aria-label={t.searchPlaceholder}
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
            {loading ? (
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
                      <Th className="px-4 py-3 text-left">{t.colSlug}</Th>
                      <Th className="px-4 py-3 text-left">{t.colName}</Th>
                      <Th className="px-4 py-3 text-left">{t.colStatus}</Th>
                      <Th className="px-4 py-3 text-left">{t.colPlan}</Th>
                      <Th className="px-4 py-3 text-left">{t.colGuilds}</Th>
                      <Th className="px-4 py-3 text-left">{t.colStaff}</Th>
                      <Th className="px-4 py-3 text-left">{t.colCreated}</Th>
                      <Th className="px-4 py-3 text-right">{t.colActions}</Th>
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
                        <td className="px-4 py-3">
                          {row.plan ? (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${planBadgeClass(
                                row.plan_status
                              )}`}
                              title={
                                row.plan_expires_at
                                  ? format(t.planExpires, {
                                      date: formatDate(row.plan_expires_at),
                                    })
                                  : undefined
                              }
                              data-testid={`tenant-plan-badge-${row.slug}`}
                            >
                              {PLAN_LABELS[row.plan]}
                              {row.plan_status &&
                                row.plan_status !== 'active' && (
                                  <span className="opacity-80">
                                    · {planStatusLabel(t, row.plan_status)}
                                  </span>
                                )}
                            </span>
                          ) : (
                            <span className="text-neutral-500 text-xs">—</span>
                          )}
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
                            <button
                              type="button"
                              onClick={() => setCheckoutTenant(row)}
                              disabled={!isOwner}
                              title={
                                isOwner ? undefined : t.generateLinkOwnerOnly
                              }
                              className="px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 hover:border-emerald-400 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-emerald-500/40"
                              data-testid={`tenant-plan-checkout-btn-${row.slug}`}
                            >
                              {t.generateLink}
                            </button>
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

export const getServerSideProps = withStaffPage({ permission: 'manage_settings' });

export default AdminTenantsListPage;
