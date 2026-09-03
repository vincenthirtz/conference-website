import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import GeneralSettingsPanel from '@/components/admin/site-settings/GeneralSettingsPanel';
import type { StaffProps } from '@/types/admin';
import nsAdminSiteSettings from '@/lib/i18n/locales/admin-fr/adminSiteSettings';

import { lazyPanel } from '@/components/admin/lazyPanel';

// Onglets secondaires : chargés au clic (cf. components/admin/lazyPanel).
const DiscordWebhooksPanel = lazyPanel(
  () => import('@/components/admin/site-settings/DiscordWebhooksPanel')
);
const TeamRolesPanel = lazyPanel(
  () => import('@/components/admin/site-settings/TeamRolesPanel')
);
const EmailSenderPanel = lazyPanel(
  () => import('@/components/admin/site-settings/EmailSenderPanel')
);

const ID_BASE = 'admin-site-settings';

export const getServerSideProps = withStaffPage({
  permission: 'manage_settings',
});

/**
 * Merged site-settings page. Hosts the former /admin/site-settings/discord and
 * /admin/site-settings/team-roles as deep-linkable tabs
 * (`?tab=general|discord|team-roles`). The old routes redirect here (see the
 * discord.tsx & team-roles.tsx shims). Whole page is admin-gated, matching the
 * strictest of the three former pages.
 */
export default function AdminSiteSettingsPage(_: StaffProps) {
  const t = useAdminT(nsAdminSiteSettings);
  const tabs = [
    { id: 'general', label: t.tabGeneral },
    { id: 'discord', label: t.tabDiscord },
    { id: 'team-roles', label: t.tabTeamRoles },
    // Compte d'envoi de l'espace : sans lui, un espace tiers n'envoie aucun
    // email (il n'emprunte pas celui de la plateforme).
    { id: 'email-sender', label: t.tabEmailSender },
  ];
  const [active, setActive] = useQueryTab(tabs);

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="mb-6">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
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
            {active === 'general' && <GeneralSettingsPanel />}
            {active === 'discord' && <DiscordWebhooksPanel />}
            {active === 'team-roles' && <TeamRolesPanel />}
            {active === 'email-sender' && <EmailSenderPanel />}
          </div>
        </div>
      </div>
    </>
  );
}
