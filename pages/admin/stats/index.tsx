import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import TeamStatsPanel from '@/components/admin/stats/TeamStatsPanel';
import type { StaffProps } from '@/types/admin';
import nsAdminStats from '@/lib/i18n/locales/admin-fr/adminStats';

import { lazyPanel } from '@/components/admin/lazyPanel';
import { withAdminQuery } from '@/features/admin/_shared/query';

// Onglets secondaires : chargés au clic (cf. components/admin/lazyPanel).
const MapStatsPanel = lazyPanel(
  () => import('@/components/admin/stats/MapStatsPanel')
);

const ID_BASE = 'admin-stats';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

/**
 * Merged statistics page. Hosts the former /admin/stats/teams and
 * /admin/stats/maps as deep-linkable tabs (`?tab=teams|maps`). The old routes
 * redirect here (see stats/teams.tsx & stats/maps.tsx shims).
 */
function AdminStatsPage(_: StaffProps) {
  const t = useAdminT(nsAdminStats);
  const tabs = [
    { id: 'teams', label: t.tabTeams },
    { id: 'maps', label: t.tabMaps },
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
        >
          {active === 'teams' ? <TeamStatsPanel /> : <MapStatsPanel />}
        </div>
      </div>
    </>
  );
}

export default withAdminQuery(AdminStatsPage);
