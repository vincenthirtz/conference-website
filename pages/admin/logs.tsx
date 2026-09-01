import Head from 'next/head';
import { withStaffPage, hasAtLeastRole } from '@/utils/staff';
import type { StaffRole } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import StaffLogsPanel from '@/components/admin/logs/StaffLogsPanel';
import EmailLogsPanel from '@/components/admin/logs/EmailLogsPanel';
import DiscordLogsPanel from '@/components/admin/logs/DiscordLogsPanel';
import type { StaffProps } from '@/types/admin';
import nsAdminJournals from '@/lib/i18n/locales/admin-fr/adminJournals';

const ID_BASE = 'admin-journals';

export const getServerSideProps = withStaffPage({ permission: 'manage_settings' });

/**
 * Merged logs page ("Journaux"). Hosts the former /admin/logs (staff audit),
 * /admin/email-logs (Brevo email events) and the Discord bot journal as
 * deep-linkable tabs (`?tab=staff|emails|discord`). The page is manager-gated;
 * the Emails and Discord tabs stay admin-only — they are only listed /
 * rendered for admin+ staff (their endpoints are admin-gated too), and the
 * legacy /admin/email-logs route remains admin-gated via its redirect shim.
 */
export default function AdminJournalsPage({ staff }: StaffProps) {
  const t = useAdminT(nsAdminJournals);
  // Emails (Brevo) et Discord (IDs Discord des joueuses) exposent des données
  // plus sensibles que l'audit staff : mêmes gardes que leurs endpoints.
  const canSeeAdminTabs = hasAtLeastRole(staff.role as StaffRole, 'admin');

  const tabs = [
    { id: 'staff', label: t.tabStaff },
    ...(canSeeAdminTabs
      ? [
          { id: 'emails', label: t.tabEmails },
          { id: 'discord', label: t.tabDiscord },
        ]
      : []),
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
            {active === 'emails' && canSeeAdminTabs ? (
              <EmailLogsPanel />
            ) : active === 'discord' && canSeeAdminTabs ? (
              <DiscordLogsPanel />
            ) : (
              <StaffLogsPanel />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
