// pages/admin/tenants/usage.tsx
//
// « Qui consomme quoi ? » — la consommation d'API de tous les espaces, sur le
// mois en cours.
//
// Les compteurs existaient depuis longtemps (`api_usage_counters`, alimentés à
// chaque appel authentifié) et n'étaient lus que par le tableau de bord
// développeur, espace par espace. Personne ne pouvait donc voir venir un
// dépassement — on l'apprenait par des 429, en pleine journée de matchs.
//
// Les plus proches du plafond en haut : c'est la seule raison d'ouvrir cet
// écran. Un plan sans quota ne s'affiche pas en « 0 % » — il n'a pas de mur, et
// le dire par un zéro serait un contresens.

import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useTenantsUsage } from '@/features/admin/tenants/hooks/useTenants';
import Breadcrumb from '@/components/admin/Breadcrumb';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import EmptyState from '@/components/admin/EmptyState';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { PLAN_LABELS, type TenantPlan } from '@/utils/billing/planFeatures';
import nsAdminTenantsUsage from '@/lib/i18n/locales/admin-fr/adminTenantsUsage';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import StatTile from '@/features/admin/_shared/ui/StatTile';

type UsageRow = {
  id: string;
  slug: string;
  name: string;
  plan: TenantPlan;
  effectivePlan: TenantPlan;
  monthLimit: number | null;
  monthUsed: number;
  percent: number | null;
  lastCallAt: string | null;
};

/** Au-delà, la ligne crie. En deçà, elle informe. */
const WARN_AT = 80;

function barClass(percent: number | null): string {
  if (percent === null) return 'bg-[var(--t4,#807984)]';
  if (percent >= 100) return 'bg-[var(--err,#ff6b6b)]';
  if (percent >= WARN_AT) return 'bg-[var(--warn,#f5a524)]';
  return 'bg-[var(--lf,#7fca65)]';
}

function AdminTenantsUsagePage() {
  const t = useAdminT(nsAdminTenantsUsage);
  const usage = useTenantsUsage<{ rows: UsageRow[]; windowKey: string }>();
  const error = usage.error
    ? usage.error.message || 'Erreur de chargement'
    : null;
  const data = usage.error
    ? { rows: [] as UsageRow[], windowKey: '' }
    : (usage.data ?? null);

  const loading = data === null;
  const rows = data?.rows ?? [];
  const atRisk = rows.filter((r) => (r.percent ?? 0) >= WARN_AT).length;
  const atLimit = rows.filter((r) => (r.percent ?? 0) >= 100).length;

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbAdmin, href: '/admin' },
            { label: t.breadcrumbTenants, href: '/admin/tenants' },
            { label: t.breadcrumbCurrent },
          ]}
        />

        <AdminPageHeader
          title={t.heading}
          subtitle={
            <>
              {t.subtitle}
              {data?.windowKey &&
                ` · ${format(t.windowLabel, { key: data.windowKey })}`}
            </>
          }
        />

        <AlertBanner message={error} className="mb-4" />

        {!loading && rows.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label={t.statSpaces} value={rows.length} />
            <StatTile
              label={t.statAtRisk}
              value={atRisk}
              tone={atRisk > 0 ? 'warn' : 'neutral'}
            />
            <StatTile
              label={t.statAtLimit}
              value={atLimit}
              tone={atLimit > 0 ? 'err' : 'neutral'}
            />
          </div>
        )}

        {loading ? (
          <LoadingSpinner label={t.loading} />
        ) : rows.length === 0 ? (
          <div className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
            <EmptyState title={t.emptyTitle} description={t.emptyDesc} />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--line,rgba(194,196,201,.12))] text-xs uppercase tracking-wider text-[var(--t3,#a39ba6)]">
                <tr>
                  <th className="px-4 py-3 text-left">{t.colTenant}</th>
                  <th className="px-4 py-3 text-left">{t.colPlan}</th>
                  <th className="px-4 py-3 text-left">{t.colUsage}</th>
                  <th className="px-4 py-3 text-left">{t.colLastCall}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    data-testid={`usage-row-${r.slug}`}
                    className="hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/tenants/${r.id}`}
                        className="font-medium text-[var(--t1,#f4edf7)] hover:text-[var(--or-200,#eec4ff)]"
                      >
                        {r.name}
                      </Link>
                      <div className="font-mono text-xs text-[var(--or-200,#eec4ff)]">
                        {r.slug}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--t2,#c7bfca)]">
                      {PLAN_LABELS[r.plan] ?? r.plan}
                      {/* Le plan facturé et le plan appliqué peuvent différer :
                          lire le quota du premier serait faux. */}
                      {r.effectivePlan !== r.plan && (
                        <span className="ml-2 text-xs text-[var(--warn,#f5a524)]">
                          {format(t.downgraded, {
                            plan: PLAN_LABELS[r.effectivePlan],
                          })}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.monthLimit === null ? (
                        <span
                          className="text-xs text-[var(--t4,#807984)]"
                          data-numeric
                        >
                          {format(t.unlimited, {
                            used: r.monthUsed.toLocaleString('fr-FR'),
                          })}
                        </span>
                      ) : (
                        <div className="min-w-[160px]">
                          <div
                            className="flex items-baseline justify-between gap-2 text-xs"
                            data-numeric
                          >
                            <span className="text-[var(--t1,#f4edf7)]">
                              {r.monthUsed.toLocaleString('fr-FR')} /{' '}
                              {r.monthLimit.toLocaleString('fr-FR')}
                            </span>
                            <span
                              className={
                                (r.percent ?? 0) >= WARN_AT
                                  ? 'text-[var(--warn,#f5a524)]'
                                  : 'text-[var(--t4,#807984)]'
                              }
                            >
                              {r.percent}%
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--s2,#1d1520)]">
                            <div
                              className={`h-full ${barClass(r.percent)}`}
                              style={{
                                width: `${Math.min(100, r.percent ?? 0)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-xs text-[var(--t3,#a39ba6)]"
                      data-numeric
                    >
                      {r.lastCallAt
                        ? new Date(r.lastCallAt).toLocaleString('fr-FR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : t.never}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default withAdminQuery(AdminTenantsUsagePage);

// Vue transverse : elle montre la consommation de TOUS les espaces, donc elle
// est réservée à l'owner de la plateforme — `manage_tenant` n'est portée que
// par ce rôle, et `scope: 'platform'` empêche qu'un propriétaire d'espace y
// entre par l'élévation que lui donne `tenant_staff`.
export const getServerSideProps = withStaffPage({
  permission: 'manage_tenant',
  scope: 'platform',
});
