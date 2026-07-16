// pages/admin/tournament/[id]/checkin.tsx
// Merged check-in route. Hosts the former /checkin (settings/status) and
// /checkin/live (live console) as deep-linkable sub-tabs
// (`?tab=settings|live`). The old /checkin/live route redirects here.

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
import CheckinSettingsPanel from '@/components/admin/tournament/CheckinSettingsPanel';
import CheckinLivePanel from '@/components/admin/tournament/CheckinLivePanel';
import type { StaffProps } from '@/types/admin';

const ID_BASE = 'admin-tournament-checkin';

export const getServerSideProps = withStaffPage('admin');

export default function AdminTournamentCheckinPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : (id ?? '');

  const t = useAdminT('adminTournamentCheckin');
  const nav = useAdminT('adminTournamentNav');
  const tabs = [
    { id: 'settings', label: nav.subCheckinSettings },
    { id: 'live', label: nav.subCheckinLive },
  ];
  const [active, setActive] = useQueryTab(tabs);

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <TournamentTabsNav tournamentId={tournamentId} active="checkin" />

          <Tabs
            tabs={tabs}
            active={active}
            onChange={setActive}
            ariaLabel={nav.tabCheckin}
            idBase={ID_BASE}
            className="mb-8"
          />

          <div
            role="tabpanel"
            id={tabPanelId(ID_BASE, active)}
            aria-labelledby={tabButtonId(ID_BASE, active)}
          >
            {active === 'settings' && <CheckinSettingsPanel />}
            {active === 'live' && <CheckinLivePanel />}
          </div>
        </div>
      </div>
    </>
  );
}
