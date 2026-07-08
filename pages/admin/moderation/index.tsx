import Head from 'next/head';
import { withStaffPage, hasAtLeastRole } from '@/utils/staff';
import type { StaffRole } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import CommentsPanel from '@/components/admin/moderation/CommentsPanel';
import DisputesPanel from '@/components/admin/moderation/DisputesPanel';
import BlacklistPanel from '@/components/admin/moderation/BlacklistPanel';
import SupportPanel from '@/components/admin/moderation/SupportPanel';
import type { StaffProps } from '@/types/admin';

const ID_BASE = 'admin-moderation';

// Hub gated at the MOST permissive role of the four merged pages: Disputes was
// caster-gated, the three others manager-gated. The page therefore admits
// caster+, and each tab re-checks its own minimum role below so a caster only
// sees "Litiges". The legacy routes keep their own gating via their redirect
// shims (they 308 here, and the target tab is hidden if the role is too low).
export const getServerSideProps = withStaffPage('caster');

/**
 * Merged moderation hub. Hosts the former /admin/comments, /admin/disputes,
 * /admin/moderation/blacklist and /admin/support as deep-linkable tabs
 * (`?tab=comments|disputes|blacklist|support`). The old routes 308-redirect
 * here (see the four shim files). Per-tab role gating:
 *   - Litiges     → caster+
 *   - Commentaires → manager+
 *   - Blacklist   → manager+
 *   - Support     → manager+
 */
export default function AdminModerationPage({ staff }: StaffProps) {
  const t = useAdminT('adminModeration');
  const isManager = hasAtLeastRole(staff.role as StaffRole, 'manager');

  const tabs = [
    ...(isManager ? [{ id: 'comments', label: t.tabComments }] : []),
    { id: 'disputes', label: t.tabDisputes },
    ...(isManager
      ? [
          { id: 'blacklist', label: t.tabBlacklist },
          { id: 'support', label: t.tabSupport },
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
            {active === 'comments' && isManager ? (
              <CommentsPanel />
            ) : active === 'blacklist' && isManager ? (
              <BlacklistPanel />
            ) : active === 'support' && isManager ? (
              <SupportPanel />
            ) : (
              <DisputesPanel />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
