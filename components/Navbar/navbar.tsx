import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { useStaffSession } from '@/hooks/useStaffSession';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import PublicNav from './PublicNav';
import { ADMIN_LINKS, filterAdminLinks } from './adminLinks';
import { PLAYER_LINKS } from './playerLinks';

const AdminTopBar = dynamic(() => import('./AdminTopBar'), { ssr: false });
const PlayerTopBar = dynamic(() => import('./PlayerTopBar'), { ssr: false });
const NavDrop = dynamic(() => import('./navDrop'), { ssr: false });

const NAV_HEIGHT = 75;
const ADMIN_BAR_HEIGHT = 44;
const PLAYER_BAR_HEIGHT = 44;

function Navbar(): JSX.Element {
  const router = useRouter();

  const { isStaff, staffName, staffRole, loading, clear } = useStaffSession();

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
    () => filterAdminLinks(staffRole, ADMIN_LINKS),
    [staffRole]
  );

  // Staff takes precedence: never show both bars. The player bar shows only on
  // /player routes, for a signed-in non-staff user, once both sessions resolved.
  const isPlayerRoute = router.pathname.startsWith('/player');
  const showPlayerBar =
    isPlayerRoute && !loading && !playerLoading && !!playerUser && !isStaff;

  const playerName =
    (playerUser?.user_metadata?.display_name as string | undefined) ||
    (playerUser?.user_metadata?.full_name as string | undefined) ||
    playerUser?.email?.split('@')[0] ||
    'Joueur';
  const playerRoleLabel =
    playerUser?.user_metadata?.role === 'captain' ? 'Capitaine' : 'Joueur';
  const playerAvatarUrl =
    (playerUser?.user_metadata?.avatar_url as string | undefined) || null;

  const headerOffset =
    !loading && isStaff
      ? ADMIN_BAR_HEIGHT
      : showPlayerBar
        ? PLAYER_BAR_HEIGHT
        : 0;
  const headerHeight = NAV_HEIGHT + headerOffset;

  const hideMarketingNav = isStaff || showPlayerBar;

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
        Aller au contenu principal
      </a>

      {!loading && isStaff && (
        <AdminTopBar
          staffName={staffName}
          staffRole={staffRole}
          links={visibleAdminLinks}
          height={ADMIN_BAR_HEIGHT}
          onLogout={handleLogout}
        />
      )}

      {showPlayerBar && (
        <PlayerTopBar
          playerName={playerName}
          roleLabel={playerRoleLabel}
          links={PLAYER_LINKS}
          height={PLAYER_BAR_HEIGHT}
          onLogout={handlePlayerLogout}
          avatarUrl={playerAvatarUrl}
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
                className="group flex shrink-0 cursor-pointer items-center"
                aria-label="Accueil"
              >
                <Image
                  src="/img/logos/2025-logo.png"
                  alt="conference logo"
                  width={150}
                  height={33}
                  className="block pt-10 transition-transform duration-300 group-hover:scale-[1.04]"
                  priority
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
              aria-label={drawerOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
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
