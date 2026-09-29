import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import GeneralSettingsPanel from '@/components/admin/site-settings/GeneralSettingsPanel';
import type { StaffProps } from '@/types/admin';
import nsAdminSiteSettings from '@/lib/i18n/locales/admin-fr/adminSiteSettings';

import { lazyPanel } from '@/components/admin/lazyPanel';
import { withAdminQuery } from '@/features/admin/_shared/query';

// Onglets secondaires : chargés au clic (cf. components/admin/lazyPanel).
const DiscordWebhooksPanel = lazyPanel(
  () => import('@/components/admin/site-settings/DiscordWebhooksPanel')
);
const TeamRolesPanel = lazyPanel(
  () => import('@/components/admin/site-settings/TeamRolesPanel')
);
const HelloAssoAccountPanel = lazyPanel(
  () => import('@/components/admin/site-settings/HelloAssoAccountPanel')
);
const SeasonalLogosPanel = lazyPanel(
  () => import('@/components/admin/site-settings/SeasonalLogosPanel')
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
function AdminSiteSettingsPage(_: StaffProps) {
  const t = useAdminT(nsAdminSiteSettings);
  const tabs = [
    { id: 'general', label: t.tabGeneral },
    { id: 'discord', label: t.tabDiscord },
    { id: 'team-roles', label: t.tabTeamRoles },
    // Logos d'événement (Octobre rose, Noël…) : programmés par dates, ils
    // remplacent le logo du site puis s'effacent seuls.
    { id: 'seasonal-logos', label: t.tabSeasonalLogos },
    // Compte d'envoi de l'espace : sans lui, un espace tiers n'envoie aucun
    // email (il n'emprunte pas celui de la plateforme).
    { id: 'email-sender', label: t.tabEmailSender },
    // Compte d'encaissement de l'espace : sans lui, aucune cagnotte de tournoi
    // ne peut être ouverte (l'argent n'irait pas à la bonne structure).
    { id: 'helloasso', label: t.tabHelloAsso },
  ];
  const [active, setActive] = useQueryTab(tabs);

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminPageHeader title={t.heading} subtitle={t.subtitle} />

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
          className="max-w-5xl"
        >
          {active === 'general' && <GeneralSettingsPanel />}
          {active === 'discord' && <DiscordWebhooksPanel />}
          {active === 'team-roles' && <TeamRolesPanel />}
          {active === 'seasonal-logos' && <SeasonalLogosPanel />}
          {active === 'email-sender' && <EmailSenderPanel />}
          {active === 'helloasso' && <HelloAssoAccountPanel />}
        </div>
      </div>
    </>
  );
}

export default withAdminQuery(AdminSiteSettingsPage);
