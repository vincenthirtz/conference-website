import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { hasAtLeastRole } from '@/utils/staffRoles';
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
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import ListToolbar, {
  FilterSelect,
  ListSearch,
} from '@/features/admin/_shared/ui/ListToolbar';

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

// Teinte de la puce plan selon l'entitlement : orchidée = actif, ambre =
// past_due, neutre = annulé.
function planChipTone(status: string | null): ChipTone {
  switch (status) {
    case 'past_due':
      return 'warn';
    case 'canceled':
      return 'neutral';
    default:
      return 'brand';
  }
}

// Même allure qu'un `AdminButtonLink` ghost, mais qui porte un `data-testid`
// (le lien du kit n'en transmet pas).
const GHOST_LINK_MD =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-transparent px-[18px] font-[family-name:var(--fd)] text-[14px] font-bold uppercase tracking-[0.02em] text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]';

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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbAdmin, href: '/admin' },
            { label: t.breadcrumbTenants },
          ]}
        />

        <AdminPageHeader
          title={t.heading}
          subtitle={
            loading
              ? t.loading
              : format(
                  tenants.length > 1
                    ? t.countTenants_other
                    : t.countTenants_one,
                  { count: tenants.length }
                )
          }
          actions={
            <>
              {/* La consommation est une vue de plateforme : elle n'a de sens —
                et n'est autorisée — que pour l'owner. */}
              {isOwner && (
                <Link
                  href="/admin/tenants/usage"
                  className={GHOST_LINK_MD}
                  data-testid="tenants-usage-link"
                >
                  {t.usageLink}
                </Link>
              )}
              <AdminButton
                variant="primary"
                onClick={() => setModalOpen(true)}
                data-testid="tenants-create-cta"
              >
                <svg
                  aria-hidden
                  className="h-4 w-4"
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
              </AdminButton>
            </>
          }
        />

        {pending.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[var(--r-card,14px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] px-4 py-3 text-sm text-[#ffd9a3]">
            <span>
              <strong data-numeric>{pending.length}</strong>
              {pending.length > 1 ? t.pendingText_other : t.pendingText_one}
            </span>
            <AdminButtonLink href="/admin/onboarding?tab=a-traiter" size="xs">
              {t.pendingViewQueue}
            </AdminButtonLink>
          </div>
        )}

        <AlertBanner message={error} className="mb-4" />

        <ListToolbar
          search={
            <ListSearch
              value={search}
              onChange={setSearch}
              placeholder={t.searchPlaceholder}
              label={t.searchPlaceholder}
            />
          }
          filters={
            <FilterSelect
              label={t.colStatus}
              allLabel={t.filterAll}
              value={filter === 'all' ? null : filter}
              onChange={(v) =>
                setFilter(v === 'active' || v === 'archived' ? v : 'all')
              }
              options={[
                { value: 'active', label: t.filterActive },
                { value: 'archived', label: t.filterArchived },
              ]}
            />
          }
        />

        <section className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
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
                <thead className="border-b border-[var(--line,rgba(194,196,201,.12))] text-xs uppercase tracking-wider text-[var(--t3,#a39ba6)]">
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
                <tbody className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
                  {visible.map((row) => (
                    <tr
                      key={row.id}
                      className="transition-colors hover:bg-white/[0.03]"
                      data-testid={`tenant-row-${row.slug}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[var(--or-200,#eec4ff)]">
                        {row.slug}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--t1,#f4edf7)]">
                        {row.name}
                      </td>
                      <td className="px-4 py-3">
                        <Chip tone={row.is_active ? 'ok' : 'neutral'}>
                          {row.is_active ? t.statusActive : t.statusArchived}
                        </Chip>
                      </td>
                      <td className="px-4 py-3">
                        {row.plan ? (
                          <span
                            className="inline-flex"
                            title={
                              row.plan_expires_at
                                ? format(t.planExpires, {
                                    date: formatDate(row.plan_expires_at),
                                  })
                                : undefined
                            }
                            data-testid={`tenant-plan-badge-${row.slug}`}
                          >
                            <Chip tone={planChipTone(row.plan_status)}>
                              {PLAN_LABELS[row.plan]}
                              {row.plan_status &&
                                row.plan_status !== 'active' && (
                                  <span className="opacity-80">
                                    · {planStatusLabel(t, row.plan_status)}
                                  </span>
                                )}
                            </Chip>
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--t4,#807984)]">
                            —
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-[var(--t2,#c7bfca)]"
                        data-numeric
                      >
                        {row.guild_count}
                      </td>
                      <td
                        className="px-4 py-3 text-[var(--t2,#c7bfca)]"
                        data-numeric
                      >
                        {row.staff_count}
                      </td>
                      <td
                        className="px-4 py-3 text-xs text-[var(--t3,#a39ba6)]"
                        data-numeric
                      >
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <AdminButton
                            variant="secondary"
                            size="xs"
                            onClick={() => setCheckoutTenant(row)}
                            disabled={!isOwner}
                            title={
                              isOwner ? undefined : t.generateLinkOwnerOnly
                            }
                            data-testid={`tenant-plan-checkout-btn-${row.slug}`}
                          >
                            {t.generateLink}
                          </AdminButton>
                          <AdminButtonLink
                            href={`/admin/tenants/${row.id}`}
                            size="xs"
                          >
                            {t.edit}
                          </AdminButtonLink>
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
    </>
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_settings',
});

export default AdminTenantsListPage;
