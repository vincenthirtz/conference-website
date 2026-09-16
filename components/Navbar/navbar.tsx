import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { supabaseClient } from '@/utils/supabaseBrowser';
import { useStaffSession } from '@/hooks/useStaffSession';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import PublicNav from './PublicNav';
import LiveLogoPulse from './LiveLogoPulse';
import { ADMIN_LINKS, filterAdminLinks } from './adminLinks';
import { PLAYER_LINKS } from './playerLinks';
import { resolveHeaderBars } from './headerBars';
import { useT } from '@/lib/i18n/useT';
import { useTenantBranding } from '@/lib/branding/TenantBrandingProvider';
import nsNavbar from '@/lib/i18n/locales/fr/navbar';

const DEFAULT_LOGO_SRC = '/img/logos/2026-logo.png';

const AdminTopBar = dynamic(() => import('./AdminTopBar'), { ssr: false });
// Palette ⌘K (lot A4) : montée avec la barre admin, donc jamais chargée côté
// public. `ssr:false` — elle n'existe qu'à partir d'un raccourci clavier.
const CommandPalette = dynamic(
  () => import('@/components/admin/CommandPalette'),
  { ssr: false }
);
const PlayerTopBar = dynamic(() => import('./PlayerTopBar'), { ssr: false });
const NavDrop = dynamic(() => import('./navDrop'), { ssr: false });

const NAV_HEIGHT = 75;
const ADMIN_BAR_HEIGHT = 44;
const PLAYER_BAR_HEIGHT = 44;

function Navbar(): JSX.Element {
  const router = useRouter();
  const tNav = useT(nsNavbar);
  const branding = useTenantBranding();
  const logoSrc = branding?.logoUrl ?? DEFAULT_LOGO_SRC;
  const logoAlt = branding?.name ? `${branding.name} logo` : 'conference logo';

  const {
    isStaff,
    staffName,
    staffRole,
    staffPermissions,
    activeTenantKind,
    loading,
    clear,
  } = useStaffSession();

  // redirect:false → the navbar must never redirect anonymous visitors; it
  // only observes the player session to decide whether to show PlayerTopBar.
  const { user: playerUser, loading: playerLoading } = usePlayerSession({
    redirect: false,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const drawerRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handleRouteChange = () => setDrawerOpen(false);
    router.events.on('routeChangeStart', handleRouteChange);
    return () => router.events.off('routeChangeStart', handleRouteChange);
  }, [router.events]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const original = document.body.style.overflow;
    if (drawerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = original || '';
    return () => {
      document.body.style.overflow = original || '';
    };
  }, [drawerOpen]);

  const visibleAdminLinks = useMemo(
    () =>
      filterAdminLinks(
        staffRole,
        ADMIN_LINKS,
        activeTenantKind ?? undefined,
        staffPermissions
      ),
    [staffRole, activeTenantKind, staffPermissions]
  );

  // Jamais deux barres. Sur /player, la barre joueuse gagne — staff compris :
  // une capitaine qui est aussi staff n'avait là que la barre admin, sans
  // « Mes matchs » ni « Notifications ». Elle y retrouve la navigation
  // joueuse, plus un lien vers l'administration (cf. headerBars.ts).
  //
  // Pour la barre admin, `visibleAdminLinks.length > 0` n'est PAS une
  // précaution décorative :
  // `AdminTopBar` se supprime elle-même quand elle n'a rien à montrer
  // (`categories.length === 0 && singleLinks.length === 0` → `return null`).
  // Avec `isStaff` seul, un compte staff dont aucun lien ne passe le filtre —
  // rôle hors barème, cache amorcé avec un rôle non-staff — obtenait
  // `hideMarketingNav = true` pour une barre qui ne s'affichait jamais : la
  // page se retrouvait sans AUCUN en-tête, sur le site public comme ailleurs.
  // L'en-tête ne se masque que si quelque chose le remplace VRAIMENT.
  const { showAdminBar, showPlayerBar } = resolveHeaderBars({
    pathname: router.pathname,
    staffLoading: loading,
    isStaff,
    adminLinkCount: visibleAdminLinks.length,
    playerLoading,
    hasPlayerUser: !!playerUser,
  });

  const playerName =
    (playerUser?.user_metadata?.display_name as string | undefined) ||
    (playerUser?.user_metadata?.full_name as string | undefined) ||
    playerUser?.email?.split('@')[0] ||
    tNav.fallbackName;
  // Lecture dans la table plutôt qu'un ternaire : « tout ce qui n'est pas
  // capitaine est joueuse » affichait « Joueuse » à une supportrice dès qu'un
  // troisième rôle de compte a existé. Un rôle inconnu retombe volontairement
  // sur « Joueuse », de loin le cas le plus fréquent.
  const accountRole = playerUser?.user_metadata?.role as string | undefined;
  const playerRoleLabel =
    (tNav.roleLabels as Record<string, string>)[accountRole ?? 'player'] ??
    tNav.roleLabels.player;
  const playerAvatarUrl =
    (playerUser?.user_metadata?.avatar_url as string | undefined) || null;

  const headerOffset = showAdminBar
    ? ADMIN_BAR_HEIGHT
    : showPlayerBar
      ? PLAYER_BAR_HEIGHT
      : 0;
  const headerHeight = NAV_HEIGHT + headerOffset;

  // Masquer la nav publique est conditionné EXACTEMENT à ce qui la remplace.
  // Avec `isStaff` seul, la fenêtre `isStaff && loading` (ou un chunk
  // AdminTopBar — `dynamic(ssr:false)` — qui n'arrive pas) laissait la page
  // sans AUCUN en-tête : ni nav publique, ni top-bar.
  const hideMarketingNav = showAdminBar || showPlayerBar;

  const handleLogout = async () => {
    setDrawerOpen(false);
    clear();
    try {
      await supabaseClient.auth.signOut();
    } catch {}
    router.push('/admin/logout');
  };

  const handlePlayerLogout = async () => {
    setDrawerOpen(false);
    try {
      await supabaseClient.auth.signOut();
    } catch {}
    router.push('/');
  };

  return (
    <nav aria-label="Navigation principale" className="relative">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded-lg focus:bg-purple-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-white"
      >
        {tNav.skipToContent}
      </a>

      {showAdminBar && (
        <>
          <AdminTopBar
            staffName={staffName}
            staffRole={staffRole}
            links={visibleAdminLinks}
            height={ADMIN_BAR_HEIGHT}
            onLogout={handleLogout}
          />
          <CommandPalette />
        </>
      )}

      {showPlayerBar && (
        <PlayerTopBar
          playerName={playerName}
          roleLabel={playerRoleLabel}
          links={PLAYER_LINKS}
          height={PLAYER_BAR_HEIGHT}
          // Staff : la déconnexion doit aussi vider le cache de session staff,
          // comme depuis la barre admin.
          onLogout={isStaff ? handleLogout : handlePlayerLogout}
          avatarUrl={playerAvatarUrl}
          adminHref={isStaff && visibleAdminLinks.length > 0 ? '/admin' : null}
        />
      )}

      <div
        className={`fixed inset-x-0 z-[100] text-white transition-[background-color,backdrop-filter,border-color] duration-300 ${
          hideMarketingNav
            ? ''
            : scrolled || drawerOpen
              ? 'border-b border-white/[0.06] bg-[#0F0820]/85 backdrop-blur-2xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]'
              : 'border-b border-transparent backdrop-blur-md'
        }`}
        style={{ top: headerOffset }}
      >
        <div
          className={
            hideMarketingNav
              ? ''
              : 'mx-auto flex h-[75px] w-full max-w-7xl items-center justify-between px-4'
          }
        >
          <div
            className="z-[99] flex items-center sm:w-full sm:justify-between"
            data-test="nav-Home"
          >
            {!hideMarketingNav && (
              <Link
                href="/"
                className="group relative flex shrink-0 cursor-pointer items-center"
                aria-label={tNav.homeAria}
              >
                {/* Pulse néon quand womens_cup est en direct — logo par défaut
                    seulement : un tenant en marque blanche n'est pas la chaîne
                    de la Women's Cup. */}
                {!branding && <LiveLogoPulse />}
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  width={64}
                  height={64}
                  className="block h-16 w-auto transition-transform duration-300 group-hover:scale-[1.04]"
                  priority
                  // Custom-domain logos (branding) live on arbitrary hosts;
                  // skip next/image optimization (and its remotePatterns check)
                  // for them. The default logo stays optimized (unchanged).
                  unoptimized={Boolean(branding?.logoUrl)}
                />
              </Link>
            )}
          </div>

          <div
            data-test="nav-Hamberger"
            className={`z-[99] min-[1119px]:hidden ${showPlayerBar ? 'hidden' : ''}`}
          >
            <button
              type="button"
              aria-label={drawerOpen ? tNav.closeMenu : tNav.openMenu}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((v) => !v)}
              className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <span className="relative block h-4 w-6">
                <span
                  className={`absolute left-0 top-0 h-[2px] w-full rounded-full bg-white transition-all duration-300 ${
                    drawerOpen ? 'translate-y-[7px] rotate-45' : ''
                  }`}
                />
                <span
                  className={`absolute left-0 top-[7px] h-[2px] w-full rounded-full bg-white transition-all duration-300 ${
                    drawerOpen ? 'opacity-0' : 'opacity-100'
                  }`}
                />
                <span
                  className={`absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-white transition-all duration-300 ${
                    drawerOpen ? '-translate-y-[7px] -rotate-45' : ''
                  }`}
                />
              </span>
            </button>
          </div>

          {!hideMarketingNav && (
            <div className="hidden min-[1119px]:flex">
              <PublicNav staffLoading={loading} showStaffLogin={!isStaff} />
            </div>
          )}

          <div
            className={`fixed inset-0 z-[98] transition-all duration-500 min-[1119px]:hidden ${
              drawerOpen
                ? 'opacity-100'
                : 'pointer-events-none -translate-y-2 opacity-0'
            }`}
            aria-hidden={!drawerOpen}
          >
            {drawerOpen && (
              <NavDrop
                ref={drawerRef}
                setDrop={setDrawerOpen}
                isStaff={isStaff}
                staffName={staffName}
                adminLinks={visibleAdminLinks}
                adminLoading={loading}
                offsetTop={headerHeight}
                onLogout={handleLogout}
              />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
