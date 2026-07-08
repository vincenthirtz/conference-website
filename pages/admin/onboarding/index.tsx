// pages/admin/onboarding/index.tsx
//
// Merged onboarding hub (Lot C). Hosts the former /admin/onboarding-queue,
// /admin/tenant-requests and /admin/pending-guild-links as deep-linkable tabs
// (`?tab=queue|tenant-requests|guild-links`). The three old routes 308-redirect
// here (see their shim files + utils/onboardingRedirect.ts).
//
// Gating — host is opened at the MOST permissive role of the three merged pages:
//   - onboarding-queue    → manager
//   - pending-guild-links → manager
//   - tenant-requests     → owner
// => host is manager-gated, and the owner-only "Demandes de tenant" tab is
// re-gated per source role: it is only listed/rendered for owners. The tenant
// request DATA stays owner-only at the API level (/api/admin/tenant-requests),
// so tab-hiding is UX, not the security boundary.

import Head from 'next/head';
import Breadcrumb from '@/components/admin/Breadcrumb';
import { withStaffPage, hasAtLeastRole } from '@/utils/staff';
import type { StaffRole } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import OnboardingQueuePanel from '@/components/admin/onboarding/OnboardingQueuePanel';
import TenantRequestsPanel from '@/components/admin/onboarding/TenantRequestsPanel';
import GuildLinksPanel from '@/components/admin/onboarding/GuildLinksPanel';
import type { StaffProps } from '@/types/admin';

const ID_BASE = 'admin-onboarding';

type Props = StaffProps & {
  /** Discord snowflake of the calling staff (owner only, best-effort, null otherwise). */
  currentStaffDiscordId: string | null;
};

export default function AdminOnboardingPage({
  staff,
  currentStaffDiscordId,
}: Props) {
  const t = useAdminT('adminOnboarding');
  const isOwner = hasAtLeastRole(staff.role as StaffRole, 'owner');

  const tabs = [
    { id: 'queue', label: t.tabQueue },
    ...(isOwner ? [{ id: 'tenant-requests', label: t.tabTenantRequests }] : []),
    { id: 'guild-links', label: t.tabGuildLinks },
  ];
  const [active, setActive] = useQueryTab(tabs);

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
              { label: t.breadcrumbCurrent },
            ]}
          />

          <div className="mb-6">
            <p className="text-sm text-neutral-400">{t.subtitle}</p>
            <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
          </div>

          <Tabs
            tabs={tabs}
            active={active}
            onChange={setActive}
            ariaLabel={t.tabsAriaLabel}
            idBase={ID_BASE}
            className="mb-8"
          />

          <div
            role="tabpanel"
            id={tabPanelId(ID_BASE, active)}
            aria-labelledby={tabButtonId(ID_BASE, active)}
          >
            {active === 'tenant-requests' && isOwner ? (
              <TenantRequestsPanel
                currentStaffDiscordId={currentStaffDiscordId}
              />
            ) : active === 'guild-links' ? (
              <GuildLinksPanel />
            ) : (
              <OnboardingQueuePanel />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// SSR: manager-gated host. The "Toi" badge on the owner-only tenant-requests
// tab needs the caller's Discord snowflake — resolve it only for owners (the
// only role that sees that tab), best-effort, never failing the page.
export const getServerSideProps = withStaffPage<{
  currentStaffDiscordId: string | null;
}>('manager', async (_ctx, staffCtx) => {
  let discordId: string | null = null;
  if (staffCtx.role === 'owner') {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(
        staffCtx.user.id
      );
      const identities = data?.user?.identities ?? [];
      const discord = identities.find(
        (i: { provider: string }) => i.provider === 'discord'
      );
      const identityData = (discord?.identity_data ?? {}) as {
        provider_id?: string;
        sub?: string;
      };
      const candidate = identityData.provider_id || identityData.sub || '';
      if (/^\d{17,20}$/.test(candidate)) {
        discordId = candidate;
      }
    } catch (err) {
      logger.error('onboarding SSR: discord id lookup failed', err);
    }
  }
  return { currentStaffDiscordId: discordId };
});
