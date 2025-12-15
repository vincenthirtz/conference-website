import Link from 'next/link';
import Dropdown from '../illustration/dropdown';
import { useState, useEffect, useRef, useCallback, JSX } from 'react';
import links from '@/config/links.json';
import NavDrop from './navDrop';
import Hamburger from '../illustration/hamburger';
import { useMediaQuery } from 'react-responsive';
import Cancel from '../illustration/cancel';
import Image from 'next/image';
import { LinkItem } from '../../types/types';
import { supabaseClient } from '@/utils/supabase';

type AdminLink = {
  title: string;
  ref: string;
};

function Navbar(): JSX.Element {
  const isTablet = useMediaQuery({ maxWidth: '1118px' });
  const [drop, setDrop] = useState<boolean>(false);
  const [show, setShow] = useState<string | null>(null);
  const [isSubMenuHovered, setIsSubMenuHovered] = useState<boolean>(false);
  const [focusedSubMenuItem, setFocusedSubMenuItem] = useState<number>(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const subMenuRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Admin / staff state (source de vérité pour tout le menu)
  const [adminLoading, setAdminLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  //TODO: Refactor Navbar Code
  let closeTimeout = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const handleClosing = useCallback(
    (event: MouseEvent) => {
      const target = event.target as Element;
      if (show && !target.closest('.subMenu')) {
        setShow(null);
        setFocusedSubMenuItem(-1);
      }
    },
    [show]
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleClosing);
    return () => {
      document.removeEventListener('mousedown', handleClosing);
    };
  }, [handleClosing]);

  const handleCloseMenu = (event: MouseEvent) => {
    const target = event.target as Element;
    if (menuRef.current && !menuRef.current.contains(target)) {
      setDrop(false);
    }
    if (svg.current && event.target === svg.current) {
      setDrop(true);
    }
  };

  useEffect(() => {
    document.addEventListener('click', handleCloseMenu);
    return () => {
      document.removeEventListener('click', handleCloseMenu);
    };
  }, [menuRef]);

  const handleMouseEnter = (title: string): void => {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
    }
    setShow(title);
  };

  const handleMouseLeave = (): void => {
    closeTimeout.current = setTimeout(() => {
      if (!isSubMenuHovered) {
        setShow(null);
        setFocusedSubMenuItem(-1);
      }
    }, 300);
  };

  const handleSubMenuEnter = (): void => {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
    }
    setIsSubMenuHovered(true);
  };

  const handleSubMenuLeave = (): void => {
    setIsSubMenuHovered(false);
    setShow(null);
    setFocusedSubMenuItem(-1);
  };

  // ----------------------------------------------------
  // 🔐 Vérifier si un staff est connecté (source de vérité)
  // ----------------------------------------------------
  const checkStaff = useCallback(
    async (accessToken?: string | null) => {
      setAdminLoading(true);
      try {
        let token = accessToken ?? null;

        if (!token) {
          const {
            data: { session },
          } = await supabaseClient.auth.getSession();
          token = session?.access_token ?? null;
        }

        if (!token) {
          setIsStaff(false);
          setStaffName(null);
          return;
        }

        const res = await fetch('/api/admin/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const me = await res.json().catch(() => null);

        if (!res.ok || me?.error || !me?.role) {
          setIsStaff(false);
          setStaffName(null);
          return;
        }

        setIsStaff(true);
        setStaffName(me.display_name || me.email || 'Staff');
      } catch (e) {
        console.error('Navbar staff check error:', e);
        setIsStaff(false);
        setStaffName(null);
      } finally {
        setAdminLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    checkStaff();

    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      (_event, session) => {
        checkStaff(session?.access_token ?? null);
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [checkStaff]);

  // Liens du menu Admin (partagés avec NavDrop)
  const adminLinks: AdminLink[] = [
    { title: 'Dashboard admin', ref: '/admin' },
    { title: 'Tournois – liste', ref: '/admin/tournaments' },
    { title: 'Créer un tournoi', ref: '/admin/tournaments/create' },
    { title: 'Équipes – liste', ref: '/admin/teams' },
    { title: 'Créer une équipe', ref: '/admin/teams/new' },
    { title: 'Ajouter membre équipe', ref: '/admin/teams/add-member' },
    { title: 'Créer un utilisateur', ref: '/admin/users/new' },
    { title: 'Demandes joueurs / équipes', ref: '/admin/demandes' },
    { title: 'Logs staff', ref: '/admin/logs' },
    { title: 'Stats équipes', ref: '/admin/stats/teams' },
    { title: 'Stats maps', ref: '/admin/stats/maps' },
  ];

  const handleLogout = () => {
    // Ferme tous les menus et envoie vers la page de logout
    setAdminMenuOpen(false);
    setDrop(false);
    window.location.href = '/admin/logout';
  };

  return (
    <div className="relative">
      <div
        className={`fixed inset-x-0 top-0 z-[99] text-white backdrop-blur ${
          drop && 'bg-[#1B1130]/90'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 py-5 flex justify-between h-[75px] w-full items-center">
          <div
            className="flex items-center sm:justify-between sm:w-full z-[99]"
            data-test="nav-Home"
          >
            <Link href="/">
              <div className="flex items-center cursor-pointer">
                <Image
                  src="/img/logos/2025-logo.png"
                  alt="conference logo"
                  width={150}
                  height={33}
                />
              </div>
            </Link>
          </div>
          {isTablet ? (
            <div data-test="nav-Hamberger" className="z-[99]">
              {drop ? (
                <button>
                  <Cancel />
                </button>
              ) : (
                <button>
                  <Hamburger ref={svg} />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center">
              {/* Liens publics existants */}
              {links
                .filter(
                  (link) =>
                    !['À propos', 'Cast', 'Sponsors', 'Équipes', 'Equipes'].includes(
                      link.title
                    )
                )
                .map((link: LinkItem) => (
                <div key={link.title}>
                  <div
                    onMouseEnter={() => handleMouseEnter(link.title)}
                    onMouseLeave={handleMouseLeave}
                    className="ml-16 text-[14px] group cursor-pointer relative flex flex-col whitespace-nowrap"
                    data-test={`nav-${link.title}`}
                  >
                    <div>
                      {link.subMenu ? (
                        <button
                          className="flex items-center focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 rounded px-1 py-1 whitespace-nowrap"
                          onClick={() =>
                            setShow(show === link.title ? null : link.title)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setShow(show === link.title ? null : link.title);
                              if (show !== link.title) {
                                setFocusedSubMenuItem(0);
                                setTimeout(() => {
                                  subMenuRefs.current[0]?.focus();
                                }, 50);
                              }
                            }
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setShow(link.title);
                              setFocusedSubMenuItem(0);
                              setTimeout(() => {
                                subMenuRefs.current[0]?.focus();
                              }, 50);
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setShow(link.title);
                              const lastIndex = link.subMenu!.length - 1;
                              setFocusedSubMenuItem(lastIndex);
                              setTimeout(() => {
                                subMenuRefs.current[lastIndex]?.focus();
                              }, 50);
                            }
                            if (e.key === 'Escape') {
                              setShow(null);
                              setFocusedSubMenuItem(-1);
                            }
                          }}
                          aria-expanded={show === link.title}
                          aria-haspopup="true"
                        >
                          {link.title}{' '}
                          {link.subMenu && (
                            <Dropdown
                              fill="white"
                              className={`ml-2 transition-transform duration-700 ${
                                show === link.title ? 'rotate-180' : 'rotate-0'
                              }`}
                            />
                          )}
                        </button>
                      ) : (
                        <Link href={link.ref ?? '#'} className="whitespace-nowrap">
                          {link.title}
                        </Link>
                      )}
                    </div>
                    <span className="after:absolute after:-bottom-1 after:left-1/2 after:w-0 after:transition-all after:h-0.5 after:bg-white after:group-hover:w-3/6  "></span>
                    <span className="after:absolute after:-bottom-1 after:right-1/2 after:w-0 after:transition-all after:h-0.5 after:bg-white after:group-hover:w-3/6"></span>
                    {show === link.title && link.subMenu && (
                      <div
                        className="subMenu absolute z-[9] mt-8 min-w-[150px] whitespace-nowrap rounded-md left-[-15px] gradient-bg px-2 py-1 flex flex-col justify-center space-y-0"
                        onMouseEnter={handleSubMenuEnter}
                        onMouseLeave={handleSubMenuLeave}
                      >
                        {link.subMenu.map((subL: LinkItem, index: number) => (
                          <Link
                            href={subL.ref ?? '#'}
                            key={subL.title}
                            rel="noopener noreferrer"
                            ref={(el) => {
                              subMenuRefs.current[index] = el;
                            }}
                            className={`flex items-center ${
                              link.subMenu!.length === 1
                                ? 'justify-center'
                                : 'justify-start'
                            } min-h-[32px] text-[16px] hover:scale-95 hover:translate-x-1 transition-all focus:outline-none focus:bg-white focus:bg-opacity-20 focus:scale-95 focus:translate-x-1 rounded px-2 py-1`}
                            data-test={`nav-sub-${subL.title}`}
                            onKeyDown={(e) => {
                              const currentIndex = index;
                              const maxIndex = link.subMenu!.length - 1;

                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const nextIndex =
                                  currentIndex === maxIndex
                                    ? 0
                                    : currentIndex + 1;
                                setFocusedSubMenuItem(nextIndex);
                                subMenuRefs.current[nextIndex]?.focus();
                              }

                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                const prevIndex =
                                  currentIndex === 0
                                    ? maxIndex
                                    : currentIndex - 1;
                                setFocusedSubMenuItem(prevIndex);
                                subMenuRefs.current[prevIndex]?.focus();
                              }

                              if (e.key === 'Escape') {
                                e.preventDefault();
                                setShow(null);
                                setFocusedSubMenuItem(-1);
                                // Focus back to the main menu button
                                const button = e.currentTarget
                                  .closest('.subMenu')
                                  ?.parentElement?.querySelector('button');
                                (button as HTMLButtonElement)?.focus();
                              }

                              if (e.key === 'Tab') {
                                setShow(null);
                                setFocusedSubMenuItem(-1);
                              }
                            }}
                          >
                            {subL.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                ))}

              {/* ------------------------------------------------
                  🔐 Zone Admin / Connexion staff (desktop only)
                 ------------------------------------------------ */}
              <div className="ml-10">
                {!adminLoading && (
                  <>
                    {!isStaff && (
                      <Link
                        href="/admin/login"
                        className="text-sm border border-purple-400/70 rounded-full px-3 py-1 hover:bg-purple-500/20 hover:border-purple-300 transition-colors"
                      >
                        Connexion
                      </Link>
                    )}

                    {isStaff && (
                      <div className="relative">
                        {/* Bouton identique dans l’esprit à NavDrop (nom staff + chevron) */}
                        <button
                          type="button"
                          onClick={() => setAdminMenuOpen((v) => !v)}
                          className="flex items-center gap-2 text-sm border border-emerald-400/70 rounded-full px-3 py-1 hover:bg-emerald-500/20 hover:border-emerald-300 transition-colors"
                        >
                          <span>{staffName || 'Staff'}</span>
                          <Dropdown
                            fill="white"
                            className={`ml-1 transition-transform duration-300 ${
                              adminMenuOpen ? 'rotate-180' : 'rotate-0'
                            }`}
                          />
                        </button>

                        {/* Dropdown Admin desktop */}
                        {adminMenuOpen && (
                          <div className="absolute right-0 mt-2 min-w-[220px] rounded-md bg-[#1B1130]/95 border border-white/10 shadow-xl py-1 z-[999]">
                            <div className="flex flex-col">
                              {adminLinks.map((item) => (
                                <Link
                                  key={item.ref}
                                  href={item.ref}
                                  className="block px-4 py-2 text-sm text-white hover:bg-white/10"
                                  onClick={() => setAdminMenuOpen(false)}
                                >
                                  {item.title}
                                </Link>
                              ))}

                              <button
                                className="w-full text-left px-4 py-2 text-xs text-red-200 hover:bg-red-500/20 border-t border-white/10 mt-1"
                                onClick={handleLogout}
                              >
                                Déconnexion
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {isTablet && (
            <div
              className={`fixed inset-0 z-[98] bg-[#1B1130]/90 backdrop-blur-md transition-all duration-500 ${
                drop
                  ? 'opacity-100'
                  : 'opacity-0 -translate-y-full pointer-events-none'
              }`}
            >
              {drop && (
                <NavDrop
                  setDrop={setDrop}
                  ref={menuRef}
                  isStaff={isStaff}
                  staffName={staffName}
                  adminLinks={adminLinks}
                  adminLoading={adminLoading}
                  onLogout={handleLogout}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Navbar;
