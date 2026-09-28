import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { castersRedirect } from '@/utils/castersRedirect';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import type { StaffProps } from '@/types/admin';
import nsAdminAssociationHub from '@/lib/i18n/locales/admin-fr/adminAssociationHub';

import { lazyPanel } from '@/components/admin/lazyPanel';

// Onglets secondaires : chargés au clic (cf. components/admin/lazyPanel).
const PoleMembersListPanel = lazyPanel(
  () => import('@/components/admin/association/PoleMembersListPanel')
);
const AdherentsListPanel = lazyPanel(
  () => import('@/components/admin/association/AdherentsListPanel')
);

const ID_BASE = 'admin-association';

// Hub gated at the shared role of its pages: Pôles de l'asso and Adhérents are
// both admin-gated, so the host is too and no per-tab role re-check is needed.
// The legacy list routes keep 308-redirect shims into the matching tab.
const guarded = withStaffPage({ permission: 'manage_communications' });

// L'onglet Casteuses est parti dans Diffusion › Casteuses (lot 8) : ses liens
// et favoris (`?tab=cast`) y sont redirigés AVANT le contrôle d'accès, qui
// est le même des deux côtés.
export const getServerSideProps: GetServerSideProps = async (ctx) =>
  ctx.query.tab === 'cast' ? castersRedirect(ctx.query) : guarded(ctx);

/**
 * Merged association hub. Hosts the former /admin/pole-members and
 * /admin/adherents list pages as deep-linkable tabs (`?tab=poles|adherents`).
 * The casters list moved to Diffusion › Casteuses (`/admin/diffusion/casteuses`);
 * `?tab=cast` redirects there. The editors pole-members/new, pole-members/[id],
 * adherents/new and adherents/[id] remain standalone routes.
 */
export default function AdminAssociationPage(_props: StaffProps) {
  const t = useAdminT(nsAdminAssociationHub);

  const tabs = [
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
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-header pb-12">
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
            {active === 'adherents' ? (
              <AdherentsListPanel />
            ) : (
              <PoleMembersListPanel />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
