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

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import Breadcrumb from '@/components/admin/Breadcrumb';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import EmptyState from '@/components/admin/EmptyState';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { PLAN_LABELS, type TenantPlan } from '@/utils/billing/planFeatures';
import nsAdminTenantsUsage from '@/lib/i18n/locales/admin-fr/adminTenantsUsage';

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
  if (percent === null) return 'bg-neutral-600';
  if (percent >= 100) return 'bg-red-500';
  if (percent >= WARN_AT) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function AdminTenantsUsagePage() {
  const t = useAdminT(nsAdminTenantsUsage);
  const { adminFetchJson } = useAdminFetch();
  const [data, setData] = useState<{
    rows: UsageRow[];
    windowKey: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(
        await adminFetchJson<{ rows: UsageRow[]; windowKey: string }>(
          '/api/admin/tenants/usage'
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
      setData({ rows: [], windowKey: '' });
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const loading = data === null;
  const rows = data?.rows ?? [];
  const atRisk = rows.filter((r) => (r.percent ?? 0) >= WARN_AT).length;

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
              { label: t.breadcrumbTenants, href: '/admin/tenants' },
              { label: t.breadcrumbCurrent },
            ]}
          />

          <div className="mb-6">
            <p className="text-sm text-neutral-400">{t.subtitle}</p>
            <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            {data?.windowKey && (
              <p className="mt-2 text-xs text-neutral-500">
                {format(t.windowLabel, { key: data.windowKey })}
                {atRisk > 0 && ` · ${format(t.atRisk, { n: atRisk })}`}
              </p>
            )}
          </div>

          <AlertBanner message={error} className="mb-4" />

          {loading ? (
            <LoadingSpinner label={t.loading} />
          ) : rows.length === 0 ? (
            <EmptyState title={t.emptyTitle} description={t.emptyDesc} />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-neutral-700/50 bg-neutral-800/50">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900/50 text-xs uppercase tracking-wider text-neutral-400">
                  <tr>
                    <th className="px-4 py-3 text-left">{t.colTenant}</th>
                    <th className="px-4 py-3 text-left">{t.colPlan}</th>
                    <th className="px-4 py-3 text-left">{t.colUsage}</th>
                    <th className="px-4 py-3 text-left">{t.colLastCall}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-700/50">
                  {rows.map((r) => (
                    <tr key={r.id} data-testid={`usage-row-${r.slug}`}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/tenants/${r.id}`}
                          className="font-medium text-white hover:text-purple-300"
                        >
                          {r.name}
                        </Link>
                        <div className="font-mono text-xs text-purple-300">
                          {r.slug}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-300">
                        {PLAN_LABELS[r.plan] ?? r.plan}
                        {r.effectivePlan !== r.plan && (
                          // Le plan facturé et le plan appliqué peuvent
                          // différer : lire le quota du premier serait faux.
                          <span className="ml-2 text-xs text-amber-300">
                            {format(t.downgraded, {
                              plan: PLAN_LABELS[r.effectivePlan],
                            })}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.monthLimit === null ? (
                          <span className="text-xs text-neutral-500">
                            {format(t.unlimited, {
                              used: r.monthUsed.toLocaleString('fr-FR'),
                            })}
                          </span>
                        ) : (
                          <div className="min-w-[160px]">
                            <div className="flex items-baseline justify-between gap-2 text-xs">
                              <span className="text-neutral-200">
                                {r.monthUsed.toLocaleString('fr-FR')} /{' '}
                                {r.monthLimit.toLocaleString('fr-FR')}
                              </span>
                              <span
                                className={
                                  (r.percent ?? 0) >= WARN_AT
                                    ? 'text-amber-300'
                                    : 'text-neutral-500'
                                }
                              >
                                {r.percent}%
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
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
                      <td className="px-4 py-3 text-xs text-neutral-400">
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
      </div>
    </>
  );
}

export default AdminTenantsUsagePage;

// Vue transverse : elle montre la consommation de TOUS les espaces, donc elle
// est réservée à l'owner de la plateforme — `manage_tenant` n'est portée que
// par ce rôle, et `scope: 'platform'` empêche qu'un propriétaire d'espace y
// entre par l'élévation que lui donne `tenant_staff`.
export const getServerSideProps = withStaffPage({
  permission: 'manage_tenant',
  scope: 'platform',
});
