import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import PartnersListPanel from '@/components/admin/partners/PartnersListPanel';
import PartnershipRequestsPanel from '@/components/admin/partners/PartnershipRequestsPanel';
import type { StaffProps } from '@/types/admin';

const ID_BASE = 'admin-partners';

export const getServerSideProps = withStaffPage('admin');

/**
 * Merged partners hub. Hosts the former /admin/partners (list + création) and
 * /admin/partnership-requests (demandes entrantes) as deep-linkable tabs
 * (`?tab=list|requests`). The old /admin/partnership-requests route
 * 308-redirects to `?tab=requests` (see the shim file). La page détail d'une
 * demande (/admin/partnership-requests/[id]) reste une route à part.
 *
 * `?new=1` (ex-route /admin/partners/new) ouvre la modale de création dans
 * l'onglet « Partenaires » — les query params `tab` et `new` coexistent.
 */
export default function AdminPartnersHubPage(_props: StaffProps) {
  const t = useAdminT('adminPartnersHub');

  const tabs = [
    { id: 'list', label: t.tabList },
    { id: 'requests', label: t.tabRequests },
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
            {active === 'requests' ? (
              <PartnershipRequestsPanel />
            ) : (
              <PartnersListPanel />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
