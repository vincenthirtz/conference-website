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
import type { StaffProps } from '@/types/admin';

const ID_BASE = 'admin-journals';

export const getServerSideProps = withStaffPage('admin');

/**
 * Merged logs page ("Journaux"). Hosts the former /admin/logs (staff audit) and
 * /admin/email-logs (Brevo email events) as deep-linkable tabs
 * (`?tab=staff|emails`). The page is manager-gated; the Emails tab stays
 * admin-only — it is only listed / rendered for admin+ staff, and the legacy
 * /admin/email-logs route remains admin-gated via its redirect shim.
 */
export default function AdminJournalsPage({ staff }: StaffProps) {
  const t = useAdminT('adminJournals');
  const canSeeEmails = hasAtLeastRole(staff.role as StaffRole, 'admin');

  const tabs = [
    { id: 'staff', label: t.tabStaff },
    ...(canSeeEmails ? [{ id: 'emails', label: t.tabEmails }] : []),
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
            {active === 'emails' && canSeeEmails ? (
              <EmailLogsPanel />
            ) : (
              <StaffLogsPanel />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
