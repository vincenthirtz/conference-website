import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage, hasAtLeastRole, type StaffRole } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useToast } from '@/components/Toast';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  getPlanFeatures,
  type TenantPlan,
  type PlanStatus,
  type PlanFeatures,
  type PurchasablePlan,
} from '@/utils/billing/planFeatures';

import { logger } from '../../utils/logger';
import nsAdminBilling from '@/lib/i18n/locales/admin-fr/adminBilling';

type CatalogItem = {
  plan: PurchasablePlan;
  label: string;
  priceEur: number;
};

type PaymentRow = {
  id: number | string;
  plan: string;
  amountCents: number;
  paidAt: string | null;
  helloassoPaymentId: number | string;
};

type BillingResponse = {
  plan: TenantPlan;
  planLabel: string;
  planStatus: PlanStatus;
  planStartedAt: string | null;
  planExpiresAt: string | null;
  daysRemaining: number | null;
  /** Essai gratuit d'onboarding : jamais payé, se termine en Découverte. */
  isTrial: boolean;
  effectivePlan: TenantPlan;
  /** L'échéance est passée mais les capacités tiennent encore (T10). */
  inGrace?: boolean;
  graceEndsAt?: string | null;
  capabilities: PlanFeatures;
  catalog: CatalogItem[];
  payments: PaymentRow[];
};

type CheckoutResponse = {
  redirectUrl: string;
  checkoutIntentId: number | string;
  plan: PurchasablePlan;
  amountEur: number;
};

type Props = {
  staff: {
    id: string;
    role: StaffRole;
    display_name: string;
  };
};

// Ordre de plan pour décider du libellé du CTA (souscrire / passer à / renouveler).
const PLAN_RANK: Record<TenantPlan, number> = {
  discovery: 0,
  regie: 1,
  circuit: 2,
  foundation: 3,
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

function formatAmount(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

const CheckIcon = () => (
  <svg
    className="w-4 h-4 text-emerald-400 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.5}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

const DashIcon = () => (
  <svg
    className="w-4 h-4 text-neutral-600 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.5}
      d="M18 12H6"
    />
  </svg>
);

function AdminBillingPage({ staff }: Props) {
  const t = useAdminT(nsAdminBilling);
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const {
    tenant: activeTenant,
    isLoading: tenantLoading,
    error: tenantError,
  } = useActiveTenant();

  const isOwner = hasAtLeastRole(staff.role, 'owner');

  const [data, setData] = useState<BillingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<PurchasablePlan | null>(
    null
  );

  const tenantId = activeTenant?.id ?? null;

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setError(null);
    try {
      const json = await adminFetchJson<BillingResponse>(
        `/api/admin/tenants/${tenantId}/billing`
      );
      setData(json);
    } catch (err) {
      logger.error('AdminBillingPage: fetch error', err);
      setError((err as Error)?.message || t.errorLoad);
    }
  }, [adminFetchJson, tenantId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCheckout = async (plan: PurchasablePlan) => {
    if (!isOwner || !tenantId) return;
    setCheckoutPlan(plan);
    try {
      const resp = await mutateJson<CheckoutResponse>(
        `/api/admin/tenants/${tenantId}/plan-checkout`,
        { method: 'POST', body: JSON.stringify({ plan }) }
      );
      addToast(t.redirecting, 'info');
      // Ouvre HelloAsso dans un nouvel onglet — le webhook activera le plan.
      window.open(resp.redirectUrl, '_blank', 'noopener');
    } catch (err) {
      logger.error('AdminBillingPage: checkout error', err);
      addToast((err as Error)?.message || t.ctaError, 'error');
    } finally {
      setCheckoutPlan(null);
    }
  };

  const isDowngraded = data ? data.effectivePlan !== data.plan : false;

  // `foundation` = système de l'association (flagship, gratuit à vie) → hors
  // La Coupe elle-même (`foundation`) n'a ni catalogue ni historique
  // commercial : le self-serve (souscrire / renouveler) ne concerne que les
  // trois offres facturées.
  const isAssociationPlan = data ? data.plan === 'foundation' : false;
  const canSelfServeBill = !!data && !isAssociationPlan;

  const statusMeta = (status: PlanStatus) => {
    switch (status) {
      case 'active':
        return {
          label: t.statusActive,
          className:
            'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30',
        };
      case 'past_due':
        return {
          label: t.statusPastDue,
          className:
            'bg-amber-600/20 text-amber-300 border border-amber-500/30',
        };
      case 'canceled':
      default:
        return {
          label: t.statusCanceled,
          className:
            'bg-neutral-700/40 text-neutral-400 border border-neutral-600/40',
        };
    }
  };

  const eventOpsLabel = (v: PlanFeatures['discordEventOps']) =>
    v === 'full'
      ? t.capEventOpsFull
      : v === 'basic'
        ? t.capEventOpsBasic
        : t.capEventOpsNone;

  // CTA libellé selon le plan courant vs cible.
  const ctaLabel = (targetPlan: PurchasablePlan): string => {
    if (!data) return t.subscribe;
    const targetLabel = data.catalog.find((c) => c.plan === targetPlan)?.label;
    // Même plan facturé → renouveler (ou réactiver si downgradé).
    if (data.plan === targetPlan) return t.renew;
    const currentRank = PLAN_RANK[data.plan] ?? 0;
    const targetRank = PLAN_RANK[targetPlan] ?? 0;
    if (targetRank > currentRank) {
      return format(t.switchTo, { plan: targetLabel ?? targetPlan });
    }
    if (targetRank < currentRank) {
      return format(t.downgradeTo, { plan: targetLabel ?? targetPlan });
    }
    return t.subscribe;
  };

  const capabilityRow = (
    label: string,
    value: boolean | string,
    key: string
  ) => (
    <li key={key} className="flex items-center gap-2 text-sm">
      {typeof value === 'boolean' ? (
        value ? (
          <CheckIcon />
        ) : (
          <DashIcon />
        )
      ) : (
        <CheckIcon />
      )}
      <span
        className={
          typeof value === 'boolean' && !value
            ? 'text-neutral-500'
            : 'text-neutral-200'
        }
      >
        {label}
        {typeof value === 'string' && (
          <span className="ml-1 text-neutral-400">— {value}</span>
        )}
      </span>
    </li>
  );

  const renderCapabilities = (f: PlanFeatures, keyPrefix: string) => (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
      {capabilityRow(t.capApiRead, f.apiRead, `${keyPrefix}-apiread`)}
      {capabilityRow(t.capApiWrite, f.apiWrite, `${keyPrefix}-apiwrite`)}
      {capabilityRow(t.capDiscordBot, f.discordBot, `${keyPrefix}-bot`)}
      {capabilityRow(
        `${t.capEventOps} (${eventOpsLabel(f.discordEventOps)})`,
        f.discordEventOps !== 'none',
        `${keyPrefix}-ops`
      )}
      {capabilityRow(t.capWhiteLabel, f.whiteLabel, `${keyPrefix}-wl`)}
      {capabilityRow(t.capMultiTenant, f.multiTenant, `${keyPrefix}-mt`)}
      {capabilityRow(t.capArbitration, f.arbitration, `${keyPrefix}-arb`)}
      {capabilityRow(t.capRatings, f.ratings, `${keyPrefix}-rat`)}
    </ul>
  );

  const loading =
    tenantLoading || (tenantId !== null && data === null && error === null);

  const paymentColumns: DataTableColumn<PaymentRow>[] = [
    {
      key: 'date',
      header: t.colDate,
      value: (p) => p.paidAt ?? '',
      className: 'text-neutral-300',
      render: (p) => <>{formatDate(p.paidAt)}</>,
    },
    {
      key: 'plan',
      header: t.colPlan,
      value: (p) => p.plan,
      render: (p) => (
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wider text-neutral-300">
          {p.plan}
        </span>
      ),
    },
    {
      key: 'amount',
      header: t.colAmount,
      value: (p) => p.amountCents,
      headerClassName: 'text-right',
      className: 'text-right font-medium text-white',
      render: (p) => <>{formatAmount(p.amountCents)}</>,
    },
    {
      key: 'helloasso',
      header: t.colHelloasso,
      value: (p) => String(p.helloassoPaymentId),
      className: 'font-mono text-xs text-purple-300',
    },
  ];

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbBilling },
            ]}
          />

          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            <p className="mt-1 text-sm text-neutral-400">{t.subheading}</p>
          </div>

          <AlertBanner message={error ?? tenantError} className="mb-4" />

          {loading && (
            <div className="py-16">
              <LoadingSpinner label={t.loading} />
            </div>
          )}

          {!loading && !tenantId && <EmptyState title={t.noActiveTenant} />}

          {!loading && data && (
            <div className="space-y-8">
              {/* Current plan card */}
              {/* Période de grâce : l'échéance est passée, les capacités
                  tiennent encore quelques jours. C'est le seul moment où le
                  client peut agir avant de perdre son bot — le taire, c'est le
                  laisser découvrir la rétrogradation par la panne. */}
              {data.inGrace && (
                <div
                  className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
                  role="status"
                  data-testid="billing-grace-banner"
                >
                  {data.graceEndsAt
                    ? format(t.graceBannerUntil, {
                        date: new Date(data.graceEndsAt).toLocaleDateString(
                          'fr-FR'
                        ),
                      })
                    : t.graceBanner}
                </div>
              )}

              <section
                className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 sm:p-8"
                data-testid="billing-current-plan"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                      {t.currentPlanHeading}
                    </p>
                    <div className="mt-1 flex items-center gap-3 flex-wrap">
                      <h2 className="text-2xl font-bold">{data.planLabel}</h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMeta(data.planStatus).className}`}
                        data-testid="billing-status-badge"
                      >
                        {statusMeta(data.planStatus).label}
                      </span>
                      {data.isTrial && (
                        <span
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/15 text-sky-200 border border-sky-500/30"
                          data-testid="billing-trial-badge"
                        >
                          {t.trialBadge}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    {data.planStartedAt && (
                      <p className="text-neutral-400">
                        {t.startedAtLabel}{' '}
                        <span className="text-neutral-200">
                          {formatDate(data.planStartedAt)}
                        </span>
                      </p>
                    )}
                    <p className="text-neutral-400 mt-0.5">
                      {t.expiresAtLabel}{' '}
                      <span className="text-neutral-200">
                        {data.planExpiresAt
                          ? formatDate(data.planExpiresAt)
                          : t.noExpiry}
                      </span>
                    </p>
                    {data.daysRemaining !== null && (
                      <p
                        className={`mt-0.5 font-medium ${data.daysRemaining <= 0 ? 'text-red-300' : 'text-neutral-300'}`}
                      >
                        {data.daysRemaining <= 0
                          ? t.expired
                          : format(t.expireInDays, {
                              days: data.daysRemaining,
                            })}
                      </p>
                    )}
                  </div>
                </div>

                {data.isTrial && (
                  <div
                    className="mt-5 rounded-xl border border-sky-500/40 bg-sky-500/10 p-4"
                    data-testid="billing-trial-notice"
                  >
                    <p className="text-sm text-sky-100">{t.trialNotice}</p>
                  </div>
                )}

                {isDowngraded && (
                  <div
                    className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
                    data-testid="billing-downgrade-notice"
                  >
                    <p className="text-sm font-semibold text-amber-200">
                      {t.downgradeNoticeTitle}
                    </p>
                    <p className="mt-1 text-sm text-amber-100/80">
                      {format(t.downgradeNoticeMsg, { plan: data.planLabel })}
                    </p>
                  </div>
                )}

                <div className="mt-6 border-t border-neutral-700/50 pt-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-3">
                    {t.capabilitiesHeading}
                  </p>
                  {renderCapabilities(data.capabilities, 'current')}
                </div>
              </section>

              {/* Plan non self-serve : encart dédié au lieu du catalogue.
                  `foundation` est la Coupe elle-même, hors facturation. */}
              {!canSelfServeBill && (
                <section
                  className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-6"
                  data-testid="billing-not-billable"
                >
                  <h2 className="text-lg font-semibold text-sky-100">
                    {isAssociationPlan
                      ? t.associationNoticeTitle
                      : t.customNoticeTitle}
                  </h2>
                  <p className="mt-1 text-sm text-sky-100/80">
                    {isAssociationPlan
                      ? t.associationNoticeMsg
                      : t.customNoticeMsg}
                  </p>
                </section>
              )}

              {/* Catalog / upgrade */}
              {canSelfServeBill && (
                <section data-testid="billing-catalog">
                  <h2 className="text-lg font-semibold mb-4">
                    {t.catalogHeading}
                  </h2>
                  {!isOwner && (
                    <p className="mb-4 text-sm text-neutral-400">
                      {t.ownerOnlyNote}
                    </p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {data.catalog.map((item) => {
                      const isCurrent = data.plan === item.plan;
                      const features = getPlanFeatures(item.plan);
                      const busy = checkoutPlan === item.plan;
                      return (
                        <div
                          key={item.plan}
                          className={`rounded-2xl border p-6 flex flex-col ${
                            isCurrent
                              ? 'border-emerald-500/40 bg-emerald-500/5'
                              : 'border-neutral-700/50 bg-neutral-800/50'
                          }`}
                          data-testid={`billing-plan-${item.plan}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-xl font-bold">
                                {item.label}
                              </h3>
                              <p className="mt-1">
                                <span className="text-2xl font-bold">
                                  {item.priceEur} €
                                </span>
                                <span className="text-sm text-neutral-400">
                                  {' '}
                                  {t.perYear}
                                </span>
                              </p>
                            </div>
                            {isCurrent && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                                {t.currentBadge}
                              </span>
                            )}
                          </div>

                          <div className="mt-5 flex-1">
                            {renderCapabilities(features, `cat-${item.plan}`)}
                          </div>

                          <div className="mt-6">
                            <button
                              type="button"
                              onClick={() => handleCheckout(item.plan)}
                              disabled={!isOwner || busy}
                              title={!isOwner ? t.ownerOnlyNote : undefined}
                              className="w-full px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                              data-testid={`billing-checkout-${item.plan}`}
                            >
                              {busy ? t.redirecting : ctaLabel(item.plan)}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Payment history — l'association (foundation) est hors
                  facturation : pas d'historique commercial. */}
              {!isAssociationPlan && (
                <section data-testid="billing-payments">
                  <h2 className="text-lg font-semibold mb-4">
                    {t.paymentsHeading}
                  </h2>
                  <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/50 p-4 backdrop-blur">
                    {/* Historique de paiement — kit partagé (lot A5). L'export
                        CSV arrive avec, et c'est justement le tableau qu'on
                        veut sortir pour la compta. */}
                    <DataTable<PaymentRow>
                      rows={data.payments}
                      columns={paymentColumns}
                      rowKey={(p) => String(p.id)}
                      loading={false}
                      error={null}
                      emptyTitle={t.paymentsEmptyTitle}
                      emptyMessage={t.paymentsEmptyDesc}
                      exportFilename="paiements"
                    />
                  </div>
                </section>
              )}

              {/* Catalog / upgrade */}
              {canSelfServeBill && (
                <section data-testid="billing-catalog">
                  <h2 className="text-lg font-semibold mb-4">
                    {t.catalogHeading}
                  </h2>
                  {!isOwner && (
                    <p className="mb-4 text-sm text-neutral-400">
                      {t.ownerOnlyNote}
                    </p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {data.catalog.map((item) => {
                      const isCurrent = data.plan === item.plan;
                      const features = getPlanFeatures(item.plan);
                      const busy = checkoutPlan === item.plan;
                      return (
                        <div
                          key={item.plan}
                          className={`rounded-2xl border p-6 flex flex-col ${
                            isCurrent
                              ? 'border-emerald-500/40 bg-emerald-500/5'
                              : 'border-neutral-700/50 bg-neutral-800/50'
                          }`}
                          data-testid={`billing-plan-${item.plan}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-xl font-bold">
                                {item.label}
                              </h3>
                              <p className="mt-1">
                                <span className="text-2xl font-bold">
                                  {item.priceEur} €
                                </span>
                                <span className="text-sm text-neutral-400">
                                  {' '}
                                  {t.perYear}
                                </span>
                              </p>
                            </div>
                            {isCurrent && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                                {t.currentBadge}
                              </span>
                            )}
                          </div>

                          <div className="mt-5 flex-1">
                            {renderCapabilities(features, `cat-${item.plan}`)}
                          </div>

                          <div className="mt-6">
                            <button
                              type="button"
                              onClick={() => handleCheckout(item.plan)}
                              disabled={!isOwner || busy}
                              title={!isOwner ? t.ownerOnlyNote : undefined}
                              className="w-full px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                              data-testid={`billing-checkout-${item.plan}`}
                            >
                              {busy ? t.redirecting : ctaLabel(item.plan)}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Payment history — l'association (foundation) est hors
                  facturation : pas d'historique commercial. */}
              {!isAssociationPlan && (
                <section data-testid="billing-payments">
                  <h2 className="text-lg font-semibold mb-4">
                    {t.paymentsHeading}
                  </h2>
                  <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
                    {data.payments.length === 0 ? (
                      <EmptyState
                        title={t.paymentsEmptyTitle}
                        description={t.paymentsEmptyDesc}
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                            <tr>
                              <th scope="col" className="px-4 py-3 text-left">
                                {t.colDate}
                              </th>
                              <th scope="col" className="px-4 py-3 text-left">
                                {t.colPlan}
                              </th>
                              <th scope="col" className="px-4 py-3 text-right">
                                {t.colAmount}
                              </th>
                              <th scope="col" className="px-4 py-3 text-left">
                                {t.colHelloasso}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-700/50">
                            {data.payments.map((p) => (
                              <tr
                                key={String(p.id)}
                                className="hover:bg-neutral-700/30 transition-colors"
                              >
                                <td className="px-4 py-3 text-neutral-300">
                                  {formatDate(p.paidAt)}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wider bg-white/5 border border-white/10 text-neutral-300">
                                    {p.plan}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-medium text-white">
                                  {formatAmount(p.amountCents)}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-purple-300">
                                  {String(p.helloassoPaymentId)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_billing',
});

export default AdminBillingPage;
