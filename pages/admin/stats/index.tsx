import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import TeamStatsPanel from '@/components/admin/stats/TeamStatsPanel';
import MapStatsPanel from '@/components/admin/stats/MapStatsPanel';
import type { StaffProps } from '@/types/admin';

const ID_BASE = 'admin-stats';

export const getServerSideProps = withStaffPage('manager');

/**
 * Merged statistics page. Hosts the former /admin/stats/teams and
 * /admin/stats/maps as deep-linkable tabs (`?tab=teams|maps`). The old routes
 * redirect here (see stats/teams.tsx & stats/maps.tsx shims).
 */
export default function AdminStatsPage(_: StaffProps) {
  const t = useAdminT('adminStats');
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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
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
            {active === 'teams' ? <TeamStatsPanel /> : <MapStatsPanel />}
          </div>
        </div>
      </div>
    </>
  );
}
