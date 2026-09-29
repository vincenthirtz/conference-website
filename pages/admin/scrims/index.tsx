// pages/admin/scrims/index.tsx
// Admin: page à onglets pour l'espace scrims. Héberge la liste des scrims et
// la liste des grilles de planification comme onglets deep-linkables
// (`?tab=scrims|plannings`). L'ancienne route /admin/scrims/plannings redirige
// ici (voir le shim plannings/index.tsx). Page gardée sous le rôle `manager`,
// comme les deux anciennes listes.

import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import ScrimsListPanel from '@/components/admin/scrims/ScrimsListPanel';
import type { StaffProps } from '@/types/admin';
import nsAdminScrimsList from '@/lib/i18n/locales/admin-fr/adminScrimsList';

import { lazyPanel } from '@/components/admin/lazyPanel';
import { withAdminQuery } from '@/features/admin/_shared/query';

// Onglets secondaires : chargés au clic (cf. components/admin/lazyPanel).
const ScrimPlanningsListPanel = lazyPanel(
  () => import('@/components/admin/scrims/ScrimPlanningsListPanel')
);
const ScrimCalendarPanel = lazyPanel(
  () => import('@/components/admin/scrims/ScrimCalendarPanel')
);

const ID_BASE = 'admin-scrims';

export const getServerSideProps = withStaffPage({ permission: 'manage_teams' });

function AdminScrimsPage(_props: StaffProps) {
  const t = useAdminT(nsAdminScrimsList);
  const tabs = [
    { id: 'scrims', label: t.tabScrims },
    { id: 'calendar', label: t.tabCalendar },
    { id: 'plannings', label: t.tabPlannings },
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
          {active === 'scrims' && <ScrimsListPanel />}
          {active === 'calendar' && <ScrimCalendarPanel />}
          {active === 'plannings' && <ScrimPlanningsListPanel />}
        </div>
      </div>
    </>
  );
}

export default withAdminQuery(AdminScrimsPage);
