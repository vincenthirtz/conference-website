// pages/admin/tournament/[id]/bracket.tsx
// Merged bracket route. Hosts the former /bracket (view), /bracket-builder
// (builder), /map-draw and /veto screens as deep-linkable sub-tabs
// (`?tab=view|builder|map-draw|veto`). The old /bracket-builder, /map-draw and
// /veto routes redirect here.

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
import BracketPanel from '@/components/admin/tournament/BracketPanel';
import BracketBuilderPanel from '@/components/admin/tournament/BracketBuilderPanel';
import MapDrawPanel from '@/components/admin/tournament/MapDrawPanel';
import VetoPanel from '@/components/admin/tournament/VetoPanel';
import type { StaffProps } from '@/types/admin';

const ID_BASE = 'admin-tournament-bracket';

export const getServerSideProps = withStaffPage('manager');

export default function AdminTournamentBracketPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : (id ?? '');

  const nav = useAdminT('adminTournamentNav');
  const tabs = [
    { id: 'view', label: nav.subBracketView },
    { id: 'builder', label: nav.subBracketBuilder },
    { id: 'map-draw', label: nav.subBracketMapDraw },
    { id: 'veto', label: nav.subBracketVeto },
  ];
  const [active, setActive] = useQueryTab(tabs);

  return (
    <>
      <Head>
        <title>{nav.tabBracket}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <TournamentTabsNav tournamentId={tournamentId} active="bracket" />

          <Tabs
            tabs={tabs}
            active={active}
            onChange={setActive}
            ariaLabel={nav.tabBracket}
            idBase={ID_BASE}
            className="mb-8"
          />

          <div
            role="tabpanel"
            id={tabPanelId(ID_BASE, active)}
            aria-labelledby={tabButtonId(ID_BASE, active)}
          >
            {active === 'view' && <BracketPanel />}
            {active === 'builder' && <BracketBuilderPanel />}
            {active === 'map-draw' && <MapDrawPanel />}
            {active === 'veto' && <VetoPanel />}
          </div>
        </div>
      </div>
    </>
  );
}
