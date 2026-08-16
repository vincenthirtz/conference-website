// pages/developpeurs/dashboard.tsx
//
// SELF-SERVE DEVELOPER HUB (axis 03, network effect).
//
// One authenticated place for an org admin to see their API entitlement/usage,
// reach key & webhook management, discover subscribable events, and UPGRADE
// when gated. This page does NOT duplicate the key/webhook CRUD — that lives at
// /admin/api-tokens and /admin/webhooks. Here we only render read-only SUMMARIES
// and link out.
//
// Gating: withStaffPage('admin') — same gate as the /admin pages. Unauthenticated
// → /admin/login, wrong role → /403. It lives under /developpeurs/* (marketing
// chrome) but is staff-only and personalised, so we mark it noindex.
//
// Data:
//   - GET /api/admin/api-usage      → entitlement + usage (tenant-scoped server-side)
//   - GET /api/admin/api-tokens     → key summary
//   - GET /api/admin/webhooks       → webhook summary
//   - GET /api/public/webhook-events→ event catalog + signature (anon)
// The active tenant is resolved SERVER-SIDE by each admin endpoint from the staff
// context (cookie `staff_active_tenant_id` → resolveActiveTenant). The client
// just authenticates with the shared Supabase session via useAdminFetch.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import AlertBanner from '@/components/admin/AlertBanner';
import EmptyState from '@/components/admin/EmptyState';
import { PLAN_LABELS, type TenantPlan } from '@/utils/billing/planFeatures';
import { logger } from '@/utils/logger';
import nsDeveloperHub from '@/lib/i18n/locales/admin-fr/developerHub';

type Props = {
  staff: { id: string; role: string; display_name: string };
};

type ApiUsage = {
  plan: TenantPlan;
  effectivePlan: TenantPlan;
  apiRead: boolean;
  apiWrite: boolean;
  minute: { used: number; limit: number | null };
  month: { used: number; limit: number | null; key: string };
  tokensHint: string;
};

type TokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
};

type WebhookSub = {
  id: string;
  url: string;
  event_types: string[];
  enabled: boolean;
};

type EventCatalog = {
  events: Array<{ type: string; description: string }>;
  signature: { header: string; algo: string; format: string };
};

const SUMMARY_LIMIT = 5;

function formatDate(s: string | null, fallback: string): string {
  if (!s) return fallback;
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const cardClass =
  'rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur';

const secondaryBtn =
  'inline-flex items-center gap-2 rounded-lg border border-purple-400/40 bg-purple-500/10 px-4 py-2 text-sm font-semibold text-purple-100 transition hover:bg-purple-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300';

export const getServerSideProps = withStaffPage('admin');

function DeveloperHubPage({ staff }: Props) {
  const t = useAdminT(nsDeveloperHub);
  const { adminFetchJson } = useAdminFetch();

  const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookSub[] | null>(null);
  const [catalog, setCatalog] = useState<EventCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const [usageRes, tokensRes, webhooksRes, catalogRes] =
      await Promise.allSettled([
        adminFetchJson<ApiUsage>('/api/admin/api-usage'),
        adminFetchJson<{ tokens: TokenRow[] }>('/api/admin/api-tokens'),
        adminFetchJson<{ subscriptions: WebhookSub[] }>('/api/admin/webhooks'),
        adminFetchJson<{ data: EventCatalog }>('/api/public/webhook-events'),
      ]);

    if (usageRes.status === 'fulfilled') setUsage(usageRes.value);
    else
      logger.error(
        '[developpeurs/dashboard] usage load error',
        usageRes.reason
      );

    if (tokensRes.status === 'fulfilled')
      setTokens(tokensRes.value.tokens ?? []);
    else {
      setTokens([]);
      logger.error(
        '[developpeurs/dashboard] tokens load error',
        tokensRes.reason
      );
    }

    if (webhooksRes.status === 'fulfilled')
      setWebhooks(webhooksRes.value.subscriptions ?? []);
    else {
      setWebhooks([]);
      logger.error(
        '[developpeurs/dashboard] webhooks load error',
        webhooksRes.reason
      );
    }

    if (catalogRes.status === 'fulfilled') setCatalog(catalogRes.value.data);
    else
      logger.error(
        '[developpeurs/dashboard] catalog load error',
        catalogRes.reason
      );

    // Only the entitlement panel is load-bearing enough to surface a page-level
    // error banner — the summaries degrade to their own empty states.
    if (usageRes.status === 'rejected') {
      setLoadError((usageRes.reason as Error)?.message || t.errorLoad);
    }
  }, [adminFetchJson, t.errorLoad]);

  useEffect(() => {
    load();
  }, [load]);

  const locked = usage ? usage.apiRead === false : false;
  const downgraded = usage ? usage.effectivePlan !== usage.plan : false;
  const showUpgrade = locked || downgraded;

  const monthLimit = usage?.month.limit ?? null;
  const monthUsed = usage?.month.used ?? 0;
  const monthUnlimited = usage != null && monthLimit === null;
  const monthPct =
    monthLimit && monthLimit > 0
      ? Math.min(100, Math.round((monthUsed / monthLimit) * 100))
      : 0;

  const activeTokens = tokens?.filter((tok) => !tok.revoked_at) ?? [];

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-neutral-950 text-white">
        <div className="mx-auto max-w-5xl px-4 pt-28 pb-24 sm:px-6">
          {/* ===== Header ===== */}
          <header className="mb-10">
            <nav
              aria-label={t.navLabel}
              className="mb-4 flex flex-wrap items-center gap-2 text-sm"
            >
              <Link href="/developpeurs" className={secondaryBtn}>
                {t.backToDocs}
              </Link>
              <Link href="/developpeurs/reference" className={secondaryBtn}>
                {t.backToReference}
              </Link>
            </nav>
            <p className="text-sm text-purple-300">{t.kicker}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              {t.heading}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-300">
              {format(t.intro, { name: staff.display_name })}
            </p>
          </header>

          <AlertBanner
            message={loadError}
            variant="error"
            className="mb-6"
            onDismiss={() => setLoadError(null)}
          />

          {/* ===== 1. Entitlement + usage ===== */}
          <section
            aria-labelledby="entitlement-heading"
            className={`${cardClass} mb-6`}
            data-testid="dev-hub-entitlement"
          >
            <h2 id="entitlement-heading" className="text-xl font-semibold">
              {t.entitlementHeading}
            </h2>

            {usage === null ? (
              <LoadingSpinner label={t.loading} className="py-12" />
            ) : (
              <div className="mt-4 space-y-6">
                {/* Plan + entitlement badges */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-sm">
                    {t.planLabel}:{' '}
                    <strong className="text-white">
                      {PLAN_LABELS[usage.plan] ?? usage.plan}
                    </strong>
                  </span>
                  {downgraded && (
                    <span
                      className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200"
                      data-testid="dev-hub-effective-plan"
                    >
                      {t.effectivePlanLabel}:{' '}
                      <strong>
                        {PLAN_LABELS[usage.effectivePlan] ??
                          usage.effectivePlan}
                      </strong>
                    </span>
                  )}
                  <EntitlementBadge
                    on={usage.apiRead}
                    label={t.apiReadLabel}
                    yes={t.badgeEnabled}
                    no={t.badgeLocked}
                  />
                  <EntitlementBadge
                    on={usage.apiWrite}
                    label={t.apiWriteLabel}
                    yes={t.badgeEnabled}
                    no={t.badgeLocked}
                  />
                </div>

                {/* Upgrade funnel tie-in */}
                {showUpgrade && (
                  <div
                    className="rounded-xl border border-purple-400/40 bg-purple-500/[0.1] p-5"
                    data-testid="dev-hub-upgrade"
                  >
                    <h3 className="text-base font-semibold text-white">
                      {locked ? t.lockedTitle : t.downgradedTitle}
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-200">
                      {locked ? t.lockedBody : t.downgradedBody}
                    </p>
                    <Link
                      href="/admin/billing"
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
                      data-testid="dev-hub-upgrade-cta"
                    >
                      {t.upgradeCta}
                    </Link>
                  </div>
                )}

                {/* Monthly usage */}
                <div>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-gray-200">
                      {t.monthUsageLabel}
                    </span>
                    <span className="text-sm text-gray-300">
                      {monthUnlimited
                        ? format(t.monthUsageUnlimited, {
                            used: String(monthUsed),
                          })
                        : format(t.monthUsageValue, {
                            used: String(monthUsed),
                            limit: String(monthLimit ?? 0),
                          })}
                    </span>
                  </div>
                  {monthUnlimited ? (
                    <p className="text-xs text-gray-400">{t.unlimited}</p>
                  ) : (
                    <div
                      role="progressbar"
                      aria-valuenow={monthUsed}
                      aria-valuemin={0}
                      aria-valuemax={monthLimit ?? 0}
                      aria-valuetext={format(t.monthUsageValue, {
                        used: String(monthUsed),
                        limit: String(monthLimit ?? 0),
                      })}
                      aria-label={t.monthUsageLabel}
                      className="h-2.5 w-full overflow-hidden rounded-full bg-white/10"
                    >
                      <div
                        className={`h-full rounded-full ${
                          monthPct >= 90
                            ? 'bg-red-500'
                            : monthPct >= 70
                              ? 'bg-amber-400'
                              : 'bg-purple-500'
                        }`}
                        style={{ width: `${monthPct}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Per-minute rate limit */}
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                      {t.rateLimitLabel}
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-white">
                      {usage.minute.limit === null
                        ? t.unlimited
                        : format(t.rateLimitValue, {
                            limit: String(usage.minute.limit),
                          })}
                    </dd>
                    <p className="mt-1 text-xs text-gray-400">
                      {format(t.rateLimitCurrent, {
                        used: String(usage.minute.used),
                      })}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                      {t.monthWindowLabel}
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-white">
                      {usage.month.key}
                    </dd>
                    <p className="mt-1 text-xs text-gray-400">
                      {t.tokensHintShort}
                    </p>
                  </div>
                </dl>
              </div>
            )}
          </section>

          {/* ===== 2 + 3. Keys & Webhooks summaries ===== */}
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* API keys */}
            <section
              aria-labelledby="keys-heading"
              className={cardClass}
              data-testid="dev-hub-keys"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id="keys-heading" className="text-xl font-semibold">
                  {t.keysHeading}
                </h2>
                <Link href="/admin/api-tokens" className={secondaryBtn}>
                  {t.manageKeys}
                </Link>
              </div>

              {tokens === null ? (
                <LoadingSpinner label={t.loading} className="py-10" />
              ) : activeTokens.length === 0 ? (
                <EmptyState title={t.keysEmpty} className="py-10" />
              ) : (
                <>
                  <p className="mt-3 text-sm text-gray-300">
                    {format(t.keysCount, {
                      count: String(activeTokens.length),
                    })}
                  </p>
                  <ul className="mt-3 divide-y divide-white/10">
                    {activeTokens.slice(0, SUMMARY_LIMIT).map((tok) => (
                      <li
                        key={tok.id}
                        className="py-3"
                        data-testid={`dev-hub-key-${tok.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            {tok.name}
                          </span>
                          <code className="text-xs font-mono text-purple-200">
                            {tok.token_prefix}…
                          </code>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {tok.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-mono text-gray-300"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {t.lastUsedLabel}:{' '}
                          {formatDate(tok.last_used_at, t.neverUsed)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {activeTokens.length > SUMMARY_LIMIT && (
                    <p className="mt-2 text-xs text-gray-400">
                      {format(t.moreItems, {
                        count: String(activeTokens.length - SUMMARY_LIMIT),
                      })}
                    </p>
                  )}
                </>
              )}
            </section>

            {/* Webhooks */}
            <section
              aria-labelledby="webhooks-heading"
              className={cardClass}
              data-testid="dev-hub-webhooks"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id="webhooks-heading" className="text-xl font-semibold">
                  {t.webhooksHeading}
                </h2>
                <Link href="/admin/webhooks" className={secondaryBtn}>
                  {t.manageWebhooks}
                </Link>
              </div>

              {webhooks === null ? (
                <LoadingSpinner label={t.loading} className="py-10" />
              ) : webhooks.length === 0 ? (
                <EmptyState title={t.webhooksEmpty} className="py-10" />
              ) : (
                <>
                  <p className="mt-3 text-sm text-gray-300">
                    {format(t.webhooksCount, {
                      count: String(webhooks.length),
                    })}
                  </p>
                  <ul className="mt-3 divide-y divide-white/10">
                    {webhooks.slice(0, SUMMARY_LIMIT).map((sub) => (
                      <li
                        key={sub.id}
                        className="py-3"
                        data-testid={`dev-hub-webhook-${sub.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <code className="break-all text-sm font-mono text-white">
                            {hostOf(sub.url)}
                          </code>
                          {sub.enabled ? (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-600/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                              {t.statusActive}
                            </span>
                          ) : (
                            <span className="rounded-full border border-amber-500/30 bg-amber-600/20 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                              {t.statusDisabled}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {sub.event_types.map((ev) => (
                            <span
                              key={ev}
                              className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-mono text-gray-300"
                            >
                              {ev}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {webhooks.length > SUMMARY_LIMIT && (
                    <p className="mt-2 text-xs text-gray-400">
                      {format(t.moreItems, {
                        count: String(webhooks.length - SUMMARY_LIMIT),
                      })}
                    </p>
                  )}
                </>
              )}
            </section>
          </div>

          {/* ===== 4. Event catalog ===== */}
          <section
            aria-labelledby="catalog-heading"
            className={cardClass}
            data-testid="dev-hub-catalog"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="catalog-heading" className="text-xl font-semibold">
                {t.catalogHeading}
              </h2>
              <Link href="/developpeurs/reference" className={secondaryBtn}>
                {t.referenceCta}
              </Link>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-gray-300">
              {t.catalogIntro}
            </p>

            {catalog === null ? (
              <LoadingSpinner label={t.loading} className="py-10" />
            ) : catalog.events.length === 0 ? (
              <EmptyState title={t.catalogEmpty} className="py-10" />
            ) : (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <caption className="sr-only">{t.catalogHeading}</caption>
                    <thead>
                      <tr className="border-b border-white/10 text-gray-300">
                        <th scope="col" className="py-2 pr-4 font-semibold">
                          {t.colEvent}
                        </th>
                        <th scope="col" className="py-2 font-semibold">
                          {t.colDescription}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.events.map((ev) => (
                        <tr key={ev.type} className="border-b border-white/5">
                          <td className="py-2 pr-4 align-top">
                            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-purple-200">
                              {ev.type}
                            </code>
                          </td>
                          <td className="py-2 align-top text-gray-300">
                            {ev.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Signature block */}
                <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
                  <h3 className="text-sm font-semibold text-white">
                    {t.signatureHeading}
                  </h3>
                  <p className="mt-1 text-xs text-gray-400">
                    {t.signatureIntro}
                  </p>
                  <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-400">
                        {t.signatureHeader}
                      </dt>
                      <dd className="mt-1 font-mono text-sm text-purple-200">
                        {catalog.signature.header}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-400">
                        {t.signatureAlgo}
                      </dt>
                      <dd className="mt-1 font-mono text-sm text-purple-200">
                        {catalog.signature.algo}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-400">
                        {t.signatureFormat}
                      </dt>
                      <dd className="mt-1 font-mono text-sm text-purple-200">
                        {catalog.signature.format}
                      </dd>
                    </div>
                  </dl>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function EntitlementBadge({
  on,
  label,
  yes,
  no,
}: {
  on: boolean;
  label: string;
  yes: string;
  no: string;
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1.5 text-sm ${
        on
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
          : 'border-white/15 bg-white/[0.04] text-gray-400'
      }`}
    >
      {label}: <strong>{on ? yes : no}</strong>
    </span>
  );
}

DeveloperHubPage.displayName = 'DeveloperHubPage';
// Authed, personalised staff page under /developpeurs/* → keep it out of the index.
DeveloperHubPage.seo = { noindex: true };

export default DeveloperHubPage;
