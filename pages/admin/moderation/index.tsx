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
import type { StaffProps } from '@/types/admin';
import nsAdminModeration from '@/lib/i18n/locales/admin-fr/adminModeration';
// Namespace propre à l'onglet TCG : y ajouter une clé dans `adminModeration`
// aurait touché deux fichiers de plus et leur parité, pour un seul intitulé.
import nsAdminTcgPhotos from '@/lib/i18n/locales/admin-fr/adminTcgPhotos';
// Namespace distinct de `adminTcgPhotos` : relire une photo et mesurer une
// économie sont deux métiers, et mélanger leurs libellés obligerait à toucher
// la parité des deux à chaque évolution de l'un.
import nsAdminTcgOverview from '@/lib/i18n/locales/admin-fr/adminTcgOverview';

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
const TcgPhotosPanel = lazyPanel(
  () => import('@/components/admin/moderation/TcgPhotosPanel')
);
const TcgOverviewPanel = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverviewPanel')
);
// Panneau SÉPARÉ, monté à côté du précédent : le lien d'overlay OBS relève du
// TCG mais n'a rien à faire dans un fichier qu'on vient d'alléger pour tenir
// sous le plafond de taille des écrans admin.
const TcgOverlayCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlayCard')
);
// L'habillage vit dans un troisième composant, pour la même raison que le
// deuxième : le lien, l'apparence et la vue d'ensemble sont trois sujets.
const TcgOverlayThemeCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlayThemeCard')
);
// Distribution du cadeau d'accueil : un quatrième sujet, donc un quatrième
// composant — l'écran d'ensemble, le lien, l'apparence et le cadeau ne se
// mélangent pas.
const TcgWelcomeGiftCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgWelcomeGiftCard')
);
// Ajustement manuel d'un solde : une CORRECTION tracée (motif, journal), pas
// une distribution. Cinquième sujet, cinquième composant ; ses libellés vivent
// dans son propre namespace plutôt que dans cette page.
const TcgGrantCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgGrantCard')
);

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
  const tTcg = useAdminT(nsAdminTcgPhotos);
  const tTcgOverview = useAdminT(nsAdminTcgOverview);
  const isManager = hasAtLeastRole(staff.role as StaffRole, 'admin');
  // Les onglets TCG suivent la PERMISSION de leurs routes (`moderate_support`
  // pour photos, vue d'ensemble, overlay, cadeau et ajustement de solde), pas
  // le rôle : ce droit s'accorde à l'unité, et un caster qui l'a reçu doit voir
  // ce que l'API lui ouvre. Repli sur le rôle si la prop manque (fixtures).
  const canModerateTcg = staff.permissions
    ? staff.permissions.includes('moderate_support')
    : isManager;

  const tabs = [
    ...(isManager ? [{ id: 'comments', label: t.tabComments }] : []),
    { id: 'disputes', label: t.tabDisputes },
    ...(isManager
      ? [
          { id: 'blacklist', label: t.tabBlacklist },
          { id: 'support', label: t.tabSupport },
        ]
      : []),
    ...(canModerateTcg
      ? [
          // Relire la photo d'une personne réelle n'est pas un geste de
          // caster par défaut : même permission que Support.
          { id: 'tcg-photos', label: tTcg.tabLabel },
          // Mesurer l'économie expose qui possède quoi, et corriger un solde
          // la modifie : même permission que la file de photos.
          { id: 'tcg-overview', label: tTcgOverview.tabLabel },
        ]
      : []),
  ];
  const [active, setActive] = useQueryTab(tabs);

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
            ) : active === 'tcg-photos' && canModerateTcg ? (
              <TcgPhotosPanel />
            ) : active === 'tcg-overview' && canModerateTcg ? (
              <div className="space-y-6">
                <TcgOverviewPanel labels={tTcgOverview} />
                <TcgOverlayCard
                  labels={{
                    heading: tTcgOverview.overlayHeading,
                    subtitle: tTcgOverview.overlaySubtitle,
                    none: tTcgOverview.overlayNone,
                    createdAt: tTcgOverview.overlayCreatedAt,
                    lastUsedAt: tTcgOverview.overlayLastUsedAt,
                    neverUsed: tTcgOverview.overlayNeverUsed,
                    reveal: tTcgOverview.overlayReveal,
                    hide: tTcgOverview.overlayHide,
                    copy: tTcgOverview.overlayCopy,
                    copied: tTcgOverview.overlayCopied,
                    create: tTcgOverview.overlayCreate,
                    rotate: tTcgOverview.overlayRotate,
                    rotateWarning: tTcgOverview.overlayRotateWarning,
                    revoke: tTcgOverview.overlayRevoke,
                    revokeWarning: tTcgOverview.overlayRevokeWarning,
                    working: tTcgOverview.overlayWorking,
                    loadError: tTcgOverview.overlayLoadError,
                    saveError: tTcgOverview.overlaySaveError,
                    obsHint: tTcgOverview.overlayObsHint,
                  }}
                />
                <TcgOverlayThemeCard
                  labels={{
                    heading: tTcgOverview.themeHeading,
                    subtitle: tTcgOverview.themeSubtitle,
                    previewTitle: tTcgOverview.themePreviewTitle,
                    accent: tTcgOverview.themeAccent,
                    position: tTcgOverview.themePosition,
                    positionTopLeft: tTcgOverview.themePosTopLeft,
                    positionTopRight: tTcgOverview.themePosTopRight,
                    positionBottomLeft: tTcgOverview.themePosBottomLeft,
                    positionBottomRight: tTcgOverview.themePosBottomRight,
                    dropLine: tTcgOverview.themeDropLine,
                    winLine: tTcgOverview.themeWinLine,
                    linePlaceholder: tTcgOverview.themeLinePlaceholder,
                    lineHint: tTcgOverview.themeLineHint,
                    media: tTcgOverview.themeMedia,
                    mediaHint: tTcgOverview.themeMediaHint,
                    mediaChoose: tTcgOverview.themeMediaChoose,
                    mediaRemove: tTcgOverview.themeMediaRemove,
                    saving: tTcgOverview.themeSaving,
                    saved: tTcgOverview.themeSaved,
                    loadError: tTcgOverview.themeLoadError,
                    saveError: tTcgOverview.themeSaveError,
                    errUnsupportedType: tTcgOverview.themeErrUnsupportedType,
                    errTooLarge: tTcgOverview.themeErrTooLarge,
                    errContentMismatch: tTcgOverview.themeErrContentMismatch,
                    errInvalidColor: tTcgOverview.themeErrInvalidColor,
                    previewDropEyebrow: tTcgOverview.themePreviewDropEyebrow,
                    previewWinEyebrow: tTcgOverview.themePreviewWinEyebrow,
                    previewDropLine: tTcgOverview.themePreviewDropLine,
                    previewWinLine: tTcgOverview.themePreviewWinLine,
                    previewName: tTcgOverview.themePreviewName,
                  }}
                />
                <TcgWelcomeGiftCard
                  labels={{
                    heading: tTcgOverview.giftHeading,
                    subtitle: tTcgOverview.giftSubtitle,
                    eligible: tTcgOverview.giftEligible,
                    alreadyGifted: tTcgOverview.giftAlreadyGifted,
                    teams: tTcgOverview.giftTeams,
                    reward: tTcgOverview.giftReward,
                    noTournament: tTcgOverview.giftNoTournament,
                    nothingToDo: tTcgOverview.giftNothingToDo,
                    replayHint: tTcgOverview.giftReplayHint,
                    grant: tTcgOverview.giftGrant,
                    granting: tTcgOverview.giftGranting,
                    confirmTitle: tTcgOverview.giftConfirmTitle,
                    confirmBody: tTcgOverview.giftConfirmBody,
                    granted: tTcgOverview.giftGranted,
                    partial: tTcgOverview.giftPartial,
                    loadError: tTcgOverview.giftLoadError,
                    grantError: tTcgOverview.giftGrantError,
                  }}
                />
                <TcgGrantCard />
              </div>
            ) : (
              <DisputesPanel />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
