import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { hasAtLeastRole, type StaffRole } from '@/utils/staffRoles';
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
  type PlanTerm,
  YEARLY_MONTHS_BILLED,
} from '@/utils/billing/planFeatures';

import PlanOrderPanel from '@/components/admin/billing/PlanOrderPanel';
import { CGV_VERSION } from '@/utils/billing/cgv';
import { logger } from '../../utils/logger';
import nsAdminBilling from '@/lib/i18n/locales/admin-fr/adminBilling';
import NonprofitRnaCard from '@/components/admin/billing/NonprofitRnaCard';
import PlanCapabilities from '@/features/admin/billing/ui/PlanCapabilities';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';
const EYEBROW =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const H2 = 'mb-4 text-[19px] text-[var(--t1,#f4edf7)]';
const WARN_BOX =
  'rounded-[var(--r-card,14px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)]';
const INFO_BOX =
  'rounded-[var(--r-card,14px)] border border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.08)]';

type CatalogItem = {
  plan: PurchasablePlan;
  label: string;
  /** Prix annuel (10 mois facturés). */
  priceEur: number;
  /** Prix mensuel, dérivé de l'annuel par le barème. */
  monthlyPriceEur: number;
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
  /** Périodicité actuellement payée par l'espace. */
  planTerm: PlanTerm;
  /** L'échéance est passée mais les capacités tiennent encore (T10). */
  inGrace?: boolean;
  graceEndsAt?: string | null;
  /** Découverte offerte : association vérifiée (HelloAsso ou numéro RNA). */
  nonprofitFree?: boolean;
  nonprofitOrgName?: string | null;
  /** Numéro RNA déclaré, et provenance de l'estampille. */
  nonprofitRna?: string | null;
  nonprofitVerifiedVia?: string | null;
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
  // Sur devis, au-dessus de Circuit : jamais proposé au paiement en ligne, mais
  // un espace qui le porte ne doit pas se voir offrir « passer à Circuit ».
  editor: 3,
  foundation: 4,
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

  // Périodicité choisie pour le PROCHAIN paiement. Elle démarre sur celle que
  // l'espace paie déjà : renouveler, c'est reconduire, pas rechoisir.
  const [term, setTerm] = useState<PlanTerm>('year');
  const [termTouched, setTermTouched] = useState(false);

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

  // Aligne la périodicité sur celle du plan en cours, tant que personne n'a
  // touché au sélecteur — sinon un rechargement écraserait le choix en cours.
  useEffect(() => {
    if (data && !termTouched) setTerm(data.planTerm);
  }, [data, termTouched]);

  /**
   * Le « double clic » de l'article 1127-2 du code civil.
   *
   * Premier clic : le bouton d'une offre n'achète rien, il OUVRE le
   * récapitulatif — offre, périodicité, montant total, durée ouverte — avec de
   * quoi revenir en arrière. Second clic : le bouton portant la mention légale,
   * qui n'existe qu'une fois les deux consentements donnés.
   *
   * Les deux cases sont séparées à dessein. L'acceptation des CGV forme le
   * contrat ; la renonciation ne vaut que si elle est demandée pour elle-même.
   * Une case unique « j'accepte tout » ferait perdre l'exception et laisserait
   * courir le droit de rétractation de quatorze jours.
   */
  const [orderPlan, setOrderPlan] = useState<PurchasablePlan | null>(null);
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);

  /** Les deux consentements sont-ils donnés ? Rien ne part sans eux. */
  const ordering = cgvAccepted && waiverAccepted;

  const openOrder = (plan: PurchasablePlan) => {
    if (!isOwner) return;
    // Cases VIERGES à chaque ouverture : un consentement pré-coché n'en est pas
    // un, et un consentement hérité de la commande précédente non plus.
    setCgvAccepted(false);
    setWaiverAccepted(false);
    setOrderPlan(plan);
  };

  const closeOrder = () => {
    setOrderPlan(null);
    setCgvAccepted(false);
    setWaiverAccepted(false);
  };

  const handleCheckout = async (plan: PurchasablePlan) => {
    if (!isOwner || !tenantId) return;
    if (!cgvAccepted || !waiverAccepted) return;
    setCheckoutPlan(plan);
    try {
      const resp = await mutateJson<CheckoutResponse>(
        `/api/admin/tenants/${tenantId}/plan-checkout`,
        // La périodicité PART D'ICI. Sans elle, l'endpoint retombait sur son
        // défaut `year` : le bouton « souscrire » sous un prix mensuel générait
        // un lien de paiement annuel — 290 € demandés pour 29 € affichés.
        //
        // Les deux consentements partent avec, et le serveur les exige : le
        // contrôle côté navigateur empêche la maladresse, pas le contournement.
        {
          method: 'POST',
          body: JSON.stringify({
            plan,
            term,
            cgvVersion: CGV_VERSION,
            cgvAccepted: true,
            immediateExecutionWaiver: true,
          }),
        }
      );
      addToast(t.redirecting, 'info');
      closeOrder();
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
        return { label: t.statusActive, tone: 'ok' as ChipTone };
      case 'past_due':
        return { label: t.statusPastDue, tone: 'warn' as ChipTone };
      case 'canceled':
      default:
        return { label: t.statusCanceled, tone: 'neutral' as ChipTone };
    }
  };

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

  const loading =
    tenantLoading || (tenantId !== null && data === null && error === null);

  const paymentColumns: DataTableColumn<PaymentRow>[] = [
    {
      key: 'date',
      header: t.colDate,
      value: (p) => p.paidAt ?? '',
      className: 'font-mono text-[var(--t2,#c7bfca)]',
      render: (p) => <>{formatDate(p.paidAt)}</>,
    },
    {
      key: 'plan',
      header: t.colPlan,
      value: (p) => p.plan,
      render: (p) => <Chip tone="neutral">{p.plan}</Chip>,
    },
    {
      key: 'amount',
      header: t.colAmount,
      value: (p) => p.amountCents,
      headerClassName: 'text-right',
      className: 'text-right font-mono font-medium text-[var(--t1,#f4edf7)]',
      render: (p) => <>{formatAmount(p.amountCents)}</>,
    },
    {
      key: 'helloasso',
      header: t.colHelloasso,
      value: (p) => String(p.helloassoPaymentId),
      className: 'font-mono text-xs text-[var(--or-300,#dea3f6)]',
    },
  ];

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbBilling },
            ]}
          />

          <div className="mt-4">
            <AdminPageHeader title={t.heading} subtitle={t.subheading} />
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
                  className={`${WARN_BOX} px-4 py-3 text-sm text-[#ffd9a3]`}
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
                className={`${CARD} p-6 sm:p-8`}
                data-testid="billing-current-plan"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className={EYEBROW}>{t.currentPlanHeading}</p>
                    <div className="mt-1 flex items-center gap-3 flex-wrap">
                      <h2 className="text-[26px] text-[var(--t1,#f4edf7)]">
                        {data.planLabel}
                      </h2>
                      <Chip
                        tone={statusMeta(data.planStatus).tone}
                        data-testid="billing-status-badge"
                      >
                        {statusMeta(data.planStatus).label}
                      </Chip>
                      {data.isTrial && (
                        <Chip tone="brand" data-testid="billing-trial-badge">
                          {t.trialBadge}
                        </Chip>
                      )}
                      {/* Découverte offerte (association vérifiée). À côté du
                          palier, pas en note de bas de page : c'est la première
                          question qu'on se pose devant un écran de
                          facturation. */}
                      {data.nonprofitFree && (
                        <Chip
                          tone="ok"
                          data-testid="billing-nonprofit-badge"
                          title={data.nonprofitOrgName ?? undefined}
                        >
                          {t.nonprofitBadge}
                        </Chip>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    {data.planStartedAt && (
                      <p className="text-[var(--t3,#a39ba6)]">
                        {t.startedAtLabel}{' '}
                        <span className="font-mono text-[var(--t1,#f4edf7)]">
                          {formatDate(data.planStartedAt)}
                        </span>
                      </p>
                    )}
                    <p className="mt-0.5 text-[var(--t3,#a39ba6)]">
                      {t.expiresAtLabel}{' '}
                      <span className="font-mono text-[var(--t1,#f4edf7)]">
                        {data.planExpiresAt
                          ? formatDate(data.planExpiresAt)
                          : t.noExpiry}
                      </span>
                    </p>
                    {data.daysRemaining !== null && (
                      <p
                        className={`mt-0.5 font-medium ${data.daysRemaining <= 0 ? 'text-[var(--err,#ff6b6b)]' : 'text-[var(--t2,#c7bfca)]'}`}
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
                    className={`mt-5 p-4 ${INFO_BOX}`}
                    data-testid="billing-trial-notice"
                  >
                    <p className="text-sm text-[var(--or-200,#eec4ff)]">
                      {t.trialNotice}
                    </p>
                  </div>
                )}

                {isDowngraded && (
                  <div
                    className={`mt-5 p-4 ${WARN_BOX}`}
                    data-testid="billing-downgrade-notice"
                  >
                    <p className="text-sm font-semibold text-[#ffd9a3]">
                      {t.downgradeNoticeTitle}
                    </p>
                    <p className="mt-1 text-sm text-[var(--t2,#c7bfca)]">
                      {format(t.downgradeNoticeMsg, { plan: data.planLabel })}
                    </p>
                  </div>
                )}

                <div className="mt-6 border-t border-[var(--line2,rgba(194,196,201,.2))] pt-5">
                  <p className={`mb-3 ${EYEBROW}`}>{t.capabilitiesHeading}</p>
                  <PlanCapabilities features={data.capabilities} />
                </div>
              </section>

              {/* La porte de la gratuité, juste sous le plan courant : c'est là
                  qu'on vient voir ce qu'on paie, donc là qu'il faut apprendre
                  qu'on peut ne rien payer. */}
              {tenantId && (
                <NonprofitRnaCard
                  tenantId={tenantId}
                  rna={data.nonprofitRna ?? null}
                  verifiedVia={data.nonprofitVerifiedVia ?? null}
                  orgName={data.nonprofitOrgName ?? null}
                  onChanged={fetchData}
                />
              )}

              {/* Plan non self-serve : encart dédié au lieu du catalogue.
                  `foundation` est la Coupe elle-même, hors facturation. */}
              {!canSelfServeBill && (
                <section
                  className={`p-6 ${INFO_BOX}`}
                  data-testid="billing-not-billable"
                >
                  <h2 className="text-[19px] text-[var(--t1,#f4edf7)]">
                    {isAssociationPlan
                      ? t.associationNoticeTitle
                      : t.customNoticeTitle}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--t2,#c7bfca)]">
                    {isAssociationPlan
                      ? t.associationNoticeMsg
                      : t.customNoticeMsg}
                  </p>
                </section>
              )}

              {/* Catalog / upgrade */}
              {canSelfServeBill && (
                <section data-testid="billing-catalog">
                  <h2 className={H2}>{t.catalogHeading}</h2>
                  {!isOwner && (
                    <p className="mb-4 text-sm text-[var(--t3,#a39ba6)]">
                      {t.ownerOnlyNote}
                    </p>
                  )}

                  {/* Périodicité. Le catalogue n'affichait que l'annuel, avec
                      un « / an » écrit en dur — alors que la souscription se
                      propose au mois sur la page publique. */}
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <div
                      className="inline-flex rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-1"
                      role="group"
                      aria-label={t.termSwitchLabel}
                    >
                      {(['month', 'year'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setTermTouched(true);
                            setTerm(value);
                          }}
                          aria-pressed={term === value}
                          className={`rounded-[3px] px-4 py-1.5 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.04em] transition ${
                            term === value
                              ? 'bg-[var(--s3,#2f2732)] text-[var(--t1,#f4edf7)]'
                              : 'text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
                          }`}
                          data-testid={`billing-term-${value}`}
                        >
                          {value === 'month' ? t.termMonthly : t.termYearly}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--t3,#a39ba6)]">
                      {data.planTerm === 'month'
                        ? t.currentTermMonthly
                        : t.currentTermYearly}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {data.catalog.map((item) => {
                      const isCurrent = data.plan === item.plan;
                      const features = getPlanFeatures(item.plan);
                      const busy = checkoutPlan === item.plan;
                      return (
                        <div
                          key={item.plan}
                          className={`flex flex-col rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] p-6 ${
                            isCurrent
                              ? 'border-[rgba(127,202,101,.45)]'
                              : 'border-[var(--line2,rgba(194,196,201,.2))]'
                          }`}
                          data-testid={`billing-plan-${item.plan}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-[19px] text-[var(--t1,#f4edf7)]">
                                {item.label}
                              </h3>
                              <p className="mt-1">
                                <span
                                  className="font-[family-name:var(--fd)] text-[30px] font-extrabold text-[var(--t1,#f4edf7)] [font-stretch:75%]"
                                  data-numeric
                                >
                                  {term === 'month'
                                    ? item.monthlyPriceEur
                                    : item.priceEur}{' '}
                                  €
                                </span>
                                <span className="text-sm text-[var(--t3,#a39ba6)]">
                                  {' '}
                                  {term === 'month' ? t.perMonth : t.perYear}
                                </span>
                              </p>
                              {term === 'month' && (
                                <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                                  {format(t.termYearlySaving, {
                                    months: String(12 - YEARLY_MONTHS_BILLED),
                                    monthly: `${item.monthlyPriceEur} €`,
                                    twelve: String(item.monthlyPriceEur * 12),
                                    yearly: String(item.priceEur),
                                  })}
                                </p>
                              )}
                            </div>
                            {isCurrent && (
                              <Chip tone="ok">{t.currentBadge}</Chip>
                            )}
                          </div>

                          <div className="mt-5 flex-1">
                            <PlanCapabilities features={features} />
                          </div>

                          <div className="mt-6">
                            {/* PREMIER clic : il n'achète rien, il ouvre le
                                récapitulatif. */}
                            <AdminButton
                              variant="secondary"
                              className="w-full"
                              onClick={() => openOrder(item.plan)}
                              disabled={!isOwner || busy || ordering}
                              title={!isOwner ? t.ownerOnlyNote : undefined}
                              data-testid={`billing-checkout-${item.plan}`}
                            >
                              {busy ? t.redirecting : ctaLabel(item.plan)}
                            </AdminButton>
                          </div>

                          {orderPlan === item.plan && (
                            <PlanOrderPanel
                              plan={item.plan}
                              label={item.label}
                              term={term}
                              priceEur={
                                term === 'month'
                                  ? item.monthlyPriceEur
                                  : item.priceEur
                              }
                              busy={busy}
                              cgvAccepted={cgvAccepted}
                              waiverAccepted={waiverAccepted}
                              onCgvChange={setCgvAccepted}
                              onWaiverChange={setWaiverAccepted}
                              onSubmit={() => handleCheckout(item.plan)}
                              onCancel={closeOrder}
                              t={t}
                            />
                          )}
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
                  <h2 className={H2}>{t.paymentsHeading}</h2>
                  <div className={`${CARD} p-4`}>
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
