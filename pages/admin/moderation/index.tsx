import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { hasAtLeastRole } from '@/utils/staffRoles';
import type { StaffRole } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import CommentsPanel from '@/components/admin/moderation/CommentsPanel';
import DisputesPanel from '@/components/admin/moderation/DisputesPanel';
import type { StaffProps } from '@/types/admin';
import nsAdminModeration from '@/lib/i18n/locales/admin-fr/adminModeration';

import { lazyPanel } from '@/components/admin/lazyPanel';

// Onglets secondaires : chargés au clic (cf. components/admin/lazyPanel).
const BlacklistPanel = lazyPanel(
  () => import('@/components/admin/moderation/BlacklistPanel')
);
const EntityBlacklistPanel = lazyPanel(
  () => import('@/components/admin/moderation/EntityBlacklistPanel')
);
const SupportPanel = lazyPanel(
  () => import('@/components/admin/moderation/SupportPanel')
);
// Panneau SÉPARÉ, monté à côté du précédent : le lien d'overlay OBS relève du
// TCG mais n'a rien à faire dans un fichier qu'on vient d'alléger pour tenir
// sous le plafond de taille des écrans admin.
// L'habillage vit dans un troisième composant, pour la même raison que le
// deuxième : le lien, l'apparence et la vue d'ensemble sont trois sujets.
// Distribution du cadeau d'accueil : un quatrième sujet, donc un quatrième
// composant — l'écran d'ensemble, le lien, l'apparence et le cadeau ne se
// mélangent pas.
// Ajustement manuel d'un solde : une CORRECTION tracée (motif, journal), pas
// une distribution. Cinquième sujet, cinquième composant ; ses libellés vivent
// dans son propre namespace plutôt que dans cette page.
// Rattrapage de la récompense Battle.net : une distribution collective, donc
// voisine du cadeau d'accueil, mais un sujet à part (audience, unicité globale).

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
  const t = useAdminT(nsAdminModeration);
  const isManager = hasAtLeastRole(staff.role as StaffRole, 'admin');
  // Les onglets TCG suivent la PERMISSION de leurs routes (`manage_tcg` pour
  // photos, vue d'ensemble, overlay, cadeau et ajustement de solde), pas le
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

  // Les trois onglets TCG sont partis dans /admin/tcg — l'économie et les
  // files de relecture ne sont pas des conflits entre personnes. Les anciens
  // liens circulent (messages, documentation) : on les suit jusqu'au bon
  // onglet plutôt que de les laisser atterrir en silence sur le premier.
  const router = useRouter();
  const rawTab = Array.isArray(router.query.tab)
    ? router.query.tab[0]
    : router.query.tab;
  useEffect(() => {
    if (!rawTab || !rawTab.startsWith('tcg-')) return;
    const target = rawTab.replace(/^tcg-/, '').replace('overview', 'economie');
    void router.replace(
      { pathname: '/admin/tcg', query: { tab: target } },
      undefined,
      { shallow: false }
    );
  }, [rawTab, router]);

  // Sous-onglets de l'onglet Blacklist (joueurs / équipes & structures),
  // deep-linkables via un second param `?bl=players|entities` qui compose avec
  // le `?tab=blacklist` existant.
  const blSubTabs = [
    { id: 'players', label: t.blSubTabPlayers },
    { id: 'entities', label: t.blSubTabEntities },
  ];
  const [blActive, setBlActive] = useQueryTab(blSubTabs, 'bl');

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
            {active === 'comments' && isManager ? (
              <CommentsPanel />
            ) : active === 'blacklist' && isManager ? (
              <>
                <Tabs
                  tabs={blSubTabs}
                  active={blActive}
                  onChange={setBlActive}
                  ariaLabel={t.blSubTabsAriaLabel}
                  idBase={`${ID_BASE}-bl`}
                  className="mb-6"
                />
                <div
                  role="tabpanel"
                  id={tabPanelId(`${ID_BASE}-bl`, blActive)}
                  aria-labelledby={tabButtonId(`${ID_BASE}-bl`, blActive)}
                >
                  {blActive === 'entities' ? (
                    <EntityBlacklistPanel />
                  ) : (
                    <BlacklistPanel />
                  )}
                </div>
              </>
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
