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
import { withStaffPage } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import OnboardingQueuePanel from '@/components/admin/onboarding/OnboardingQueuePanel';
import type { StaffProps } from '@/types/admin';
import nsAdminOnboarding from '@/lib/i18n/locales/admin-fr/adminOnboarding';

import { lazyPanel } from '@/components/admin/lazyPanel';
import TenantFormModal from '@/components/admin/tenants/TenantFormModal';
import { useState } from 'react';
import { useRouter } from 'next/router';

// Onglets secondaires : chargés au clic (cf. components/admin/lazyPanel).
const TenantRequestsPanel = lazyPanel(
  () => import('@/components/admin/onboarding/TenantRequestsPanel')
);
const GuildLinksPanel = lazyPanel(
  () => import('@/components/admin/onboarding/GuildLinksPanel')
);
const TenantReadinessPanel = lazyPanel(
  () => import('@/components/admin/onboarding/TenantReadinessPanel')
);

const ID_BASE = 'admin-onboarding';

type Props = StaffProps & {
  /** Snowflake Discord de l appelant (best-effort, null si non résolu). */
  currentStaffDiscordId: string | null;
};

export default function AdminOnboardingPage({ currentStaffDiscordId }: Props) {
  const t = useAdminT(nsAdminOnboarding);
  const router = useRouter();

  // Créer un espace depuis ICI : c'est en triant cette file qu'on découvre
  // qu'un serveur en attente n'a aucun espace à rattacher. Envoyer le staff
  // sur une autre page pour revenir ensuite lui faisait perdre son contexte.
  // Même modale que `/admin/tenants` — une seule implémentation à maintenir.
  const [createOpen, setCreateOpen] = useState(false);

  // Le hub entier est réservé aux owners de la plateforme (cf. la garde SSR
  // plus bas) : plus de conditionnel par onglet, tout le monde ici a le même
  // périmètre.
  const tabs = [
    { id: 'queue', label: t.tabQueue },
    { id: 'tenant-requests', label: t.tabTenantRequests },
    { id: 'guild-links', label: t.tabGuildLinks },
    { id: 'readiness', label: t.tabReadiness },
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

          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-400">{t.subtitle}</p>
              <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight">
                {t.heading}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              data-testid="onboarding-create-tenant"
            >
              {t.createTenantCta}
            </button>
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
            {active === 'tenant-requests' ? (
              <TenantRequestsPanel
                currentStaffDiscordId={currentStaffDiscordId}
              />
            ) : active === 'guild-links' ? (
              <GuildLinksPanel />
            ) : active === 'readiness' ? (
              <TenantReadinessPanel />
            ) : (
              <OnboardingQueuePanel />
            )}
          </div>
        </div>
      </div>

      <TenantFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          // L'espace créé est immédiatement rattachable : on revient sur la
          // file des serveurs en attente, là où le besoin est né.
          void router.replace(
            { pathname: '/admin/onboarding', query: { tab: 'guild-links' } },
            undefined,
            { shallow: true }
          );
        }}
      />
    </>
  );
}

// SSR : hub réservé aux OWNERS DE LA PLATEFORME.
//
// La portée `platform` n'est pas décorative : depuis que `tenant_staff.role`
// élève le rôle effectif, le propriétaire d'un espace porte `owner` chez lui.
// Sans cette portée, il entrerait dans le hub d'onboarding — c'est-à-dire dans
// la file des demandes et des serveurs en attente de TOUS les espaces.
//
// Le badge « Toi » de l'onglet des demandes a besoin du snowflake Discord de
// l'appelant : on le résout ici, best-effort, sans jamais faire échouer la page.
// `manage_tenant` n'est portée QUE par le rôle owner (cf.
// utils/staffPermissions.ts) : c'est la forme « par permission » qu'impose le
// garde-fou `adminPageGuards`, et elle dit la même chose que « owner-only ».
export const getServerSideProps = withStaffPage<{
  currentStaffDiscordId: string | null;
}>(
  { permission: 'manage_tenant', scope: 'platform' },
  async (_ctx, staffCtx) => {
    let discordId: string | null = null;
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
    return { currentStaffDiscordId: discordId };
  }
);
