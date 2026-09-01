// pages/admin/tournament/[id]/bracket.tsx
// Merged bracket route. Hosts the former /bracket (view), /bracket-builder
// (builder), /map-draw and /veto screens as deep-linkable sub-tabs
// (`?tab=view|builder|map-draw|veto`). The old /bracket-builder, /map-draw and
// /veto routes redirect here.

import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import type { StaffProps } from '@/types/admin';
import nsAdminTournamentNav from '@/lib/i18n/locales/admin-fr/adminTournamentNav';

// Placeholder de chargement partagé par les panels code-splittés.
const PanelLoading = () => (
  <div className="flex justify-center py-16">
    <LoadingSpinner size="lg" />
  </div>
);

// Un seul onglet est monté à la fois : on charge chaque panel à la demande
// (next/dynamic, ssr:false) pour ne pas embarquer les 3 autres (~2700 l.
// cumulées) dans le chunk initial de la route.
const BracketPanel = dynamic(
  () => import('@/components/admin/tournament/BracketPanel'),
  { ssr: false, loading: PanelLoading }
);
const BracketBuilderPanel = dynamic(
  () => import('@/components/admin/tournament/BracketBuilderPanel'),
  { ssr: false, loading: PanelLoading }
);
const MapDrawPanel = dynamic(
  () => import('@/components/admin/tournament/MapDrawPanel'),
  { ssr: false, loading: PanelLoading }
);
const VetoPanel = dynamic(
  () => import('@/components/admin/tournament/VetoPanel'),
  { ssr: false, loading: PanelLoading }
);

const ID_BASE = 'admin-tournament-bracket';

export const getServerSideProps = withStaffPage({ permission: 'manage_tournaments' });

export default function AdminTournamentBracketPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : (id ?? '');

  const nav = useAdminT(nsAdminTournamentNav);
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
