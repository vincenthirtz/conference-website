// pages/admin/scrims/index.tsx
// Admin: page à onglets pour l'espace scrims. Héberge la liste des scrims et
// la liste des grilles de planification comme onglets deep-linkables
// (`?tab=scrims|plannings`). L'ancienne route /admin/scrims/plannings redirige
// ici (voir le shim plannings/index.tsx). Page gardée sous le rôle `manager`,
// comme les deux anciennes listes.

import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import ScrimsListPanel from '@/components/admin/scrims/ScrimsListPanel';
import ScrimPlanningsListPanel from '@/components/admin/scrims/ScrimPlanningsListPanel';
import ScrimCalendarPanel from '@/components/admin/scrims/ScrimCalendarPanel';
import type { StaffProps } from '@/types/admin';
import nsAdminScrimsList from '@/lib/i18n/locales/admin-fr/adminScrimsList';

const ID_BASE = 'admin-scrims';

export const getServerSideProps = withStaffPage('admin');

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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
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
            {active === 'scrims' && <ScrimsListPanel />}
            {active === 'calendar' && <ScrimCalendarPanel />}
            {active === 'plannings' && <ScrimPlanningsListPanel />}
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminScrimsPage;
