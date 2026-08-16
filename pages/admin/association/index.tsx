import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import CastMembersListPanel from '@/components/admin/association/CastMembersListPanel';
import PoleMembersListPanel from '@/components/admin/association/PoleMembersListPanel';
import AdherentsListPanel from '@/components/admin/association/AdherentsListPanel';
import type { StaffProps } from '@/types/admin';
import nsAdminAssociationHub from '@/lib/i18n/locales/admin-fr/adminAssociationHub';

const ID_BASE = 'admin-association';

// Hub gated at the shared role of the three merged pages: Casteuses, Pôles de
// l'asso and Adhérents were all admin-gated, so the host is admin-gated too and
// no per-tab role re-check is needed. The legacy list routes keep 308-redirect
// shims into the matching tab.
export const getServerSideProps = withStaffPage('admin');

/**
 * Merged association hub. Hosts the former /admin/cast-members,
 * /admin/pole-members and /admin/adherents list pages as deep-linkable tabs
 * (`?tab=cast|poles|adherents`). The old list routes 308-redirect here (see the
 * three shim files). The editors cast-members/new, cast-members/[id],
 * pole-members/new, pole-members/[id], adherents/new and adherents/[id] remain
 * standalone routes. All three tabs are admin-gated.
 */
export default function AdminAssociationPage(_props: StaffProps) {
  const t = useAdminT(nsAdminAssociationHub);

  const tabs = [
    { id: 'cast', label: t.tabCast },
    { id: 'poles', label: t.tabPoles },
    { id: 'adherents', label: t.tabAdherents },
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
            {active === 'poles' ? (
              <PoleMembersListPanel />
            ) : active === 'adherents' ? (
              <AdherentsListPanel />
            ) : (
              <CastMembersListPanel />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
