// pages/admin/tcg/index.tsx
//
// Le tableau de bord du TCG : l'économie, la file des photos de joueuses et
// celle des cartes fan art, en un seul endroit.
//
// POURQUOI UNE PAGE, ET PLUS TROIS ONGLETS DE MODÉRATION. Les trois vivaient
// dans /admin/moderation, à côté des commentaires, des litiges, de la blacklist
// et du support. Le voisinage était faux : ces quatre-là traitent des CONFLITS
// entre personnes, le TCG est un objet de jeu qu'on pilote. Le droit n'est
// d'ailleurs pas le même — `manage_tcg`, accordé à l'unité, et non
// `moderate_support`.
//
// Conséquence pratique : on ne trouvait pas l'économie du TCG en cherchant le
// TCG, il fallait savoir qu'elle était rangée sous « Modération ». Elle a
// désormais sa carte sur le tableau de bord, dans « Contenu ».
//
// Les anciens liens `/admin/moderation?tab=tcg-*` redirigent ici : ils sont
// dans des messages et dans la doc, et un lien qui atterrit silencieusement sur
// le premier onglet est pire qu'un lien mort.

import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import type { StaffProps } from '@/types/admin';
import { lazyPanel } from '@/components/admin/lazyPanel';
import nsAdminTcgPage from '@/lib/i18n/locales/admin-fr/adminTcgPage';
import nsAdminTcgOverview from '@/lib/i18n/locales/admin-fr/adminTcgOverview';
import nsAdminTcgPhotos from '@/lib/i18n/locales/admin-fr/adminTcgPhotos';
import nsAdminTcgFanart from '@/lib/i18n/locales/admin-fr/adminTcgFanart';

const ID_BASE = 'admin-tcg';

const TcgOverviewPanel = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverviewPanel')
);
const TcgPhotosPanel = lazyPanel(
  () => import('@/components/admin/moderation/TcgPhotosPanel')
);
const TcgFanartPanel = lazyPanel(
  () => import('@/components/admin/moderation/TcgFanartPanel')
);
const TcgCataloguePanel = lazyPanel(
  () => import('@/components/admin/tcg/TcgCataloguePanel')
);
const TcgEngagementPanel = lazyPanel(
  () => import('@/components/admin/tcg/TcgEngagementPanel')
);
const TcgOverlayCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlayCard')
);
const TcgOverlayThemeCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlayThemeCard')
);
const TcgWelcomeGiftCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgWelcomeGiftCard')
);
const TcgGrantCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgGrantCard')
);
const TcgBattlenetBackfillCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgBattlenetBackfillCard')
);

export default function AdminTcgPage(_props: StaffProps) {
  const t = useAdminT(nsAdminTcgPage);
  const tTcgOverview = useAdminT(nsAdminTcgOverview);
  const tTcgPhotos = useAdminT(nsAdminTcgPhotos);
  const tTcgFanart = useAdminT(nsAdminTcgFanart);

  // L'économie d'abord : c'est la vue qu'on ouvre pour SAVOIR. Les deux files
  // ne réclament l'attention que lorsqu'elles ont quelque chose dedans.
  const tabs = [
    { id: 'economie', label: tTcgOverview.tabLabel },
    { id: 'photos', label: tTcgPhotos.tabLabel },
    { id: 'fanart', label: tTcgFanart.tabLabel },
    { id: 'vue', label: t.tabCatalogue },
    { id: 'dormants', label: t.tabEngagement },
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
            {active === 'dormants' ? (
              <TcgEngagementPanel />
            ) : active === 'vue' ? (
              <TcgCataloguePanel />
            ) : active === 'fanart' ? (
              <TcgFanartPanel />
            ) : active === 'photos' ? (
              <TcgPhotosPanel />
            ) : (
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
                <TcgBattlenetBackfillCard />
                <TcgGrantCard />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Droit DÉDIÉ : relire la photo d'une personne réelle et corriger un solde ne
// sont pas des gestes de caster par défaut, et donner le support ne doit pas
// les ouvrir.
export const getServerSideProps = withStaffPage({ permission: 'manage_tcg' });
