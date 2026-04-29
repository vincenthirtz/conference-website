import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useMediaQuery } from 'react-responsive';
import { supabaseClient } from '@/utils/supabase';
import { useStaffSession } from '@/hooks/useStaffSession';
import AdminTopBar from './AdminTopBar';
import PublicNav from './PublicNav';
import NavDrop from './navDrop';
import { ADMIN_LINKS, filterAdminLinks } from './adminLinks';

const NAV_HEIGHT = 75;
const ADMIN_BAR_HEIGHT = 44;

function Navbar(): JSX.Element {
  const router = useRouter();
  const isTablet = useMediaQuery({ maxWidth: '1118px' });

  const { isStaff, staffName, staffRole, loading, clear } = useStaffSession();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

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

  const headerOffset = !loading && isStaff ? ADMIN_BAR_HEIGHT : 0;
  const headerHeight = NAV_HEIGHT + headerOffset;

  const handleLogout = async () => {
    setDrawerOpen(false);
    clear();
    try {
      await supabaseClient.auth.signOut();
    } catch {}
    router.push('/admin/logout');
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

      <div
        className={`fixed inset-x-0 z-[100] text-white transition-[background-color,backdrop-filter,border-color] duration-300 ${
          isStaff
            ? ''
            : scrolled || drawerOpen
              ? 'border-b border-white/[0.06] bg-[#0F0820]/85 backdrop-blur-2xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]'
              : 'border-b border-transparent backdrop-blur-md'
        }`}
        style={{ top: headerOffset }}
      >
        <div
          className={
            isStaff
              ? ''
              : 'mx-auto flex h-[75px] w-full max-w-7xl items-center justify-between px-4'
          }
        >
          <div
            className="z-[99] flex items-center sm:w-full sm:justify-between"
            data-test="nav-Home"
          >
            {!isStaff && (
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

          {isTablet ? (
            <div data-test="nav-Hamberger" className="z-[99]">
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
          ) : (
            !isStaff && (
              <PublicNav staffLoading={loading} showStaffLogin={!isStaff} />
            )
          )}

          {isTablet && (
            <div
              className={`fixed inset-0 z-[98] transition-all duration-500 ${
                drawerOpen
                  ? 'opacity-100'
                  : 'pointer-events-none -translate-y-2 opacity-0'
              }`}
              aria-hidden={!drawerOpen}
            >
              {drawerOpen && (
                <NavDrop
                  setDrop={setDrawerOpen}
                  ref={drawerRef}
                  isStaff={isStaff}
                  staffName={staffName}
                  adminLinks={visibleAdminLinks}
                  adminLoading={loading}
                  offsetTop={headerHeight}
                  onLogout={handleLogout}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
