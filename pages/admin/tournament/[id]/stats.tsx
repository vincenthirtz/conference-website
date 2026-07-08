// pages/admin/tournament/[id]/stats.tsx
// Merged stats route. Hosts the former /stats (standings), /analytics
// (aggregated KPIs) and /podium (final ranking) as deep-linkable sub-tabs
// (`?tab=overview|analytics|podium`). The old /analytics and /podium routes
// redirect here.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import StatsOverviewPanel from '@/components/admin/tournament/StatsOverviewPanel';
import StatsAnalyticsPanel from '@/components/admin/tournament/StatsAnalyticsPanel';
import StatsPodiumPanel from '@/components/admin/tournament/StatsPodiumPanel';
import type { StaffProps } from '@/types/admin';

const ID_BASE = 'admin-tournament-stats';

export const getServerSideProps = withStaffPage('manager');

export default function AdminTournamentStatsPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : (id ?? '');

  const nav = useAdminT('adminTournamentNav');
  const tabs = [
    { id: 'overview', label: nav.subStatsOverview },
    { id: 'analytics', label: nav.subStatsAnalytics },
    { id: 'podium', label: nav.subStatsPodium },
  ];
  const [active, setActive] = useQueryTab(tabs);

  return (
    <>
      <Head>
        <title>{nav.tabStats}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <TournamentTabsNav tournamentId={tournamentId} active="stats" />

          <Tabs
            tabs={tabs}
            active={active}
            onChange={setActive}
            ariaLabel={nav.tabStats}
            idBase={ID_BASE}
            className="mb-8"
          />

          <div
            role="tabpanel"
            id={tabPanelId(ID_BASE, active)}
            aria-labelledby={tabButtonId(ID_BASE, active)}
          >
            {active === 'overview' && <StatsOverviewPanel />}
            {active === 'analytics' && <StatsAnalyticsPanel />}
            {active === 'podium' && <StatsPodiumPanel />}
          </div>
        </div>
      </div>
    </>
  );
}
