import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { hasAtLeastRole } from '@/utils/staffRoles';
import type { StaffRole } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { withDeletedAtFallback } from '@/features/admin/recycle-bin/missingColumn';
import { escapePostgrestValue, sanitizeSearch } from '@/utils/apiHelpers';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import NewsListPanel, {
  type NewsRow,
} from '@/components/admin/communications/NewsListPanel';
import { lazyPanel } from '@/components/admin/lazyPanel';
import { withAdminQuery } from '@/features/admin/_shared/query';
import type { StaffProps } from '@/types/admin';
import { logger } from '@/utils/logger';
import nsAdminCommunicationsHub from '@/lib/i18n/locales/admin-fr/adminCommunicationsHub';

// Six panneaux, un seul monté à la fois. Seul « Actualités » (onglet par
// défaut, dont les données arrivent en SSR) reste en import statique.
const CampaignsPanel = lazyPanel(
  () => import('@/components/admin/communications/CampaignsPanel')
);
const TeamMessagesPanel = lazyPanel(
  () => import('@/components/admin/communications/TeamMessagesPanel')
);
const NotificationsPanel = lazyPanel(
  () => import('@/components/admin/communications/NotificationsPanel')
);
const SocialPostsPanel = lazyPanel(
  () => import('@/components/admin/communications/SocialPostsPanel')
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
  const db = supabaseAdmin;

  // Les actualités en corbeille (`deleted_at`) n'ont rien à faire ici ; repli
  // sans le filtre tant que add_news_soft_delete.sql n'est pas appliquée.
  const { data, error, count } = await withDeletedAtFallback(
    (filterDeleted) => {
      let q = db
        .from('news')
        .select('id, title, slug, tag, status, published_at, created_at', {
          count: 'exact',
        })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + NEWS_LIMIT - 1);

      if (filterDeleted) q = q.is('deleted_at' as never, null);
      if (status === 'draft' || status === 'published') {
        q = q.eq('status', status);
      }
      if (search) {
        const s = `%${escapePostgrestValue(search)}%`;
        q = q.or(`title.ilike.${s},slug.ilike.${s}`);
      }
      return q;
    }
  );

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
 * Merged communication hub. Hosts the former /admin/news, /admin/campaigns and
 * /admin/notifications as deep-linkable tabs
 * (`?tab=news|campaigns|notifications`). The old routes 308-redirect here (see
 * the shim files). The editors news/new and news/[id] remain standalone routes.
 * Per-tab role gating:
 *   - Notifications → caster+
 *   - Actualités    → admin+
 *   - Campagnes     → admin+
 *   - Réseaux       → admin+ (post multi-cibles : site + salon d'annonces)
 *   - Équipes       → admin+ (messages vers les salons Discord d'équipe)
 */
function AdminCommunicationsPage({
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
          { id: 'campaigns', label: t.tabCampaigns },
          { id: 'social', label: t.tabSocial },
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
          {active === 'news' && isAdmin ? (
            <NewsListPanel news={news} total={newsTotal} errorMsg={newsError} />
          ) : active === 'campaigns' && isAdmin ? (
            <CampaignsPanel />
          ) : active === 'social' && isAdmin ? (
            <SocialPostsPanel />
          ) : active === 'teams' && isAdmin ? (
            <TeamMessagesPanel />
          ) : (
            <NotificationsPanel />
          )}
        </div>
      </div>
    </>
  );
}

// Cache de requêtes des onglets (lot L10) : chargé par cette page seule.
export default withAdminQuery(AdminCommunicationsPage);
