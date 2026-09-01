import Head from 'next/head';
import { withStaffPage, hasAtLeastRole } from '@/utils/staff';
import type { StaffRole } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { escapePostgrestValue, sanitizeSearch } from '@/utils/apiHelpers';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import NewsListPanel, {
  type NewsRow,
} from '@/components/admin/communications/NewsListPanel';
import { lazyPanel } from '@/components/admin/lazyPanel';
import type { StaffProps } from '@/types/admin';
import { logger } from '@/utils/logger';
import nsAdminCommunicationsHub from '@/lib/i18n/locales/admin-fr/adminCommunicationsHub';

// Cinq panneaux, un seul monté à la fois. Seul « Actualités » (onglet par
// défaut, dont les données arrivent en SSR) reste en import statique.
const AnnouncementsListPanel = lazyPanel(
  () => import('@/components/admin/communications/AnnouncementsListPanel')
);
const CampaignsPanel = lazyPanel(
  () => import('@/components/admin/communications/CampaignsPanel')
);
const TeamMessagesPanel = lazyPanel(
  () => import('@/components/admin/communications/TeamMessagesPanel')
);
const NotificationsPanel = lazyPanel(
  () => import('@/components/admin/communications/NotificationsPanel')
);

const ID_BASE = 'admin-communications';
const NEWS_LIMIT = 20;

type HubProps = StaffProps & {
  news: NewsRow[];
  newsTotal: number;
  newsError: string | null;
};

// Hub gated at the MOST permissive role of the four merged pages: Notifications
// was caster-gated, the three others admin-gated. The page therefore admits
// caster+, and each tab re-checks its own minimum role below so a caster only
// sees "Notifications". The legacy routes keep their own gating via their
// redirect shims (they 308 here, and the target tab is hidden if the role is
// too low).
export const getServerSideProps = withStaffPage<{
  news: NewsRow[];
  newsTotal: number;
  newsError: string | null;
}>('caster', async (ctx, staffCtx) => {
  // Only admins can see the "Actualités" tab, so only load its SSR data for
  // them (identical query to the ex-page /admin/news). Filters (search/status/
  // offset) are URL-driven and re-run this loader via router.replace(asPath).
  const empty = { news: [] as NewsRow[], newsTotal: 0, newsError: null };
  if (!hasAtLeastRole(staffCtx.role as StaffRole, 'admin')) return empty;

  const { query } = ctx;
  const search = sanitizeSearch(query.search);
  const status = typeof query.status === 'string' ? query.status : null;
  const offset = Math.max(0, Number(query.offset) || 0);

  if (!supabaseAdmin) {
    return { news: [], newsTotal: 0, newsError: 'Service indisponible' };
  }

  const { tenantId } = staffCtx;

  let q = supabaseAdmin
    .from('news')
    .select('id, title, slug, tag, status, published_at, created_at', {
      count: 'exact',
    })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + NEWS_LIMIT - 1);

  if (status === 'draft' || status === 'published') {
    q = q.eq('status', status);
  }
  if (search) {
    const s = `%${escapePostgrestValue(search)}%`;
    q = q.or(`title.ilike.${s},slug.ilike.${s}`);
  }

  const { data, error, count } = await q;

  if (error) {
    logger.error('admin communications (news) SSR error:', error);
    return { news: [], newsTotal: 0, newsError: 'Erreur lors du chargement' };
  }

  return {
    news: (data || []) as NewsRow[],
    newsTotal: typeof count === 'number' ? count : (data?.length ?? 0),
    newsError: null,
  };
});

/**
 * Merged communication hub. Hosts the former /admin/news, /admin/announcements,
 * /admin/campaigns and /admin/notifications as deep-linkable tabs
 * (`?tab=news|announcements|campaigns|notifications`). The old routes
 * 308-redirect here (see the four shim files). The editors news/new,
 * news/[id], announcements/new and announcements/[id] remain standalone routes.
 * Per-tab role gating:
 *   - Notifications → caster+
 *   - Actualités    → admin+
 *   - Annonces      → admin+
 *   - Campagnes     → admin+
 *   - Équipes       → admin+ (messages vers les salons Discord d'équipe)
 */
export default function AdminCommunicationsPage({
  staff,
  news,
  newsTotal,
  newsError,
}: HubProps) {
  const t = useAdminT(nsAdminCommunicationsHub);
  const isAdmin = hasAtLeastRole(staff.role as StaffRole, 'admin');

  const tabs = [
    ...(isAdmin
      ? [
          { id: 'news', label: t.tabNews },
          { id: 'announcements', label: t.tabAnnouncements },
          { id: 'campaigns', label: t.tabCampaigns },
          { id: 'teams', label: t.tabTeams },
        ]
      : []),
    { id: 'notifications', label: t.tabNotifications },
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
            {active === 'news' && isAdmin ? (
              <NewsListPanel
                news={news}
                total={newsTotal}
                errorMsg={newsError}
              />
            ) : active === 'announcements' && isAdmin ? (
              <AnnouncementsListPanel />
            ) : active === 'campaigns' && isAdmin ? (
              <CampaignsPanel />
            ) : active === 'teams' && isAdmin ? (
              <TeamMessagesPanel />
            ) : (
              <NotificationsPanel />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
