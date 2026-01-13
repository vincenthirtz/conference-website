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
import type { AdminLink } from '@/types/components';
import {
  formatStaffRoleLabel,
  hasAtLeastRole,
  type StaffRole,
} from '@/utils/staff';

const NAV_HEIGHT = 75;
const ADMIN_BAR_HEIGHT = 44;

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
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
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
  const checkStaff = useCallback(async (accessToken?: string | null) => {
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
        setStaffRole(null);
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
        setStaffRole(null);
        return;
      }

      setIsStaff(true);
      setStaffRole(me.role as StaffRole);
      setStaffName(me.display_name || me.email || 'Staff');
    } catch (e) {
      console.error('Navbar staff check error:', e);
      setIsStaff(false);
      setStaffName(null);
      setStaffRole(null);
    } finally {
      setAdminLoading(false);
    }
  }, []);

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
    { title: 'Dashboard', ref: '/admin', minRole: 'caster' },
    {
      title: 'Tournois',
      ref: '',
      minRole: 'manager',
      children: [
        {
          title: 'Tournois – liste',
          ref: '/admin/tournaments',
          minRole: 'manager',
        },
        {
          title: 'Créer un tournoi',
          ref: '/admin/tournaments/create',
          minRole: 'manager',
        },
      ],
    },
    {
      title: 'Équipes',
      ref: '',
      minRole: 'manager',
      children: [
        { title: 'Équipes – liste', ref: '/admin/teams', minRole: 'manager' },
        {
          title: 'Créer une équipe',
          ref: '/admin/teams/new',
          minRole: 'manager',
        },
        {
          title: 'Ajouter membre équipe',
          ref: '/admin/teams/add-member',
          minRole: 'manager',
        },
        {
          title: 'Gérer mon équipe (capitaine)',
          ref: '/admin/teams/my',
          minRole: 'caster',
        },
        {
          title: 'Demandes joueurs / équipes',
          ref: '/admin/demandes',
          minRole: 'manager',
        },
      ],
    },
    {
      title: 'Gestion partenaires',
      ref: '',
      minRole: 'admin',
      children: [
        {
          title: 'Partenaires – liste',
          ref: '/admin/partners',
          minRole: 'admin',
        },
        {
          title: 'Ajouter un partenaire',
          ref: '/admin/partners/new',
          minRole: 'admin',
        },
        {
          title: 'Demandes de partenariat',
          ref: '/admin/partnership-requests',
          minRole: 'admin',
        },
      ],
    },
    {
      title: 'Contenu',
      ref: '',
      minRole: 'manager',
      children: [
        {
          title: 'Annonces',
          ref: '',
          minRole: 'admin',
          children: [
            {
              title: 'Liste des annonces',
              ref: '/admin/announcements',
              minRole: 'admin',
            },
            {
              title: 'Créer une annonce',
              ref: '/admin/announcements/new',
              minRole: 'admin',
            },
          ],
        },
        {
          title: 'News',
          ref: '',
          minRole: 'admin',
          children: [
            { title: 'Liste des news', ref: '/admin/news', minRole: 'admin' },
            { title: 'Créer une news', ref: '/admin/news/new', minRole: 'admin' },
          ],
        },
        {
          title: 'Chaînes Twitch',
          ref: '',
          minRole: 'admin',
          children: [
            {
              title: 'Liste des chaînes',
              ref: '/admin/twitch-channels',
              minRole: 'admin',
            },
            {
              title: 'Ajouter une chaîne',
              ref: '/admin/twitch-channels/new',
              minRole: 'admin',
            },
          ],
        },
        {
          title: 'Casteuses',
          ref: '',
          minRole: 'admin',
          children: [
            {
              title: 'Liste des casteuses',
              ref: '/admin/cast-members',
              minRole: 'admin',
            },
            {
              title: 'Ajouter une casteuse',
              ref: '/admin/cast-members/new',
              minRole: 'admin',
            },
          ],
        },
        {
          title: 'Commentaires',
          ref: '/admin/comments',
          minRole: 'manager',
        },
        {
          title: 'Messages contact',
          ref: '/admin/contact-submissions',
          minRole: 'manager',
        },
      ],
    },
    {
      title: 'Gestion adhérents',
      ref: '',
      minRole: 'admin',
      children: [
        {
          title: 'Liste des adhérents',
          ref: '/admin/adherents',
          minRole: 'admin',
        },
        {
          title: 'Ajouter un adhérent',
          ref: '/admin/adherents/new',
          minRole: 'admin',
        },
      ],
    },
    {
      title: 'Logs & stats',
      ref: '',
      minRole: 'manager',
      children: [
        { title: 'Logs staff', ref: '/admin/logs', minRole: 'manager' },
        {
          title: 'Stats équipes',
          ref: '/admin/stats/teams',
          minRole: 'manager',
        },
        { title: 'Stats maps', ref: '/admin/stats/maps', minRole: 'manager' },
      ],
    },
    {
      title: 'Configuration',
      ref: '',
      minRole: 'admin',
      children: [
        {
          title: 'Paramètres du site',
          ref: '/admin/site-settings',
          minRole: 'admin',
        },
        {
          title: 'Gérer les utilisateurs',
          ref: '/admin/users/manage',
          minRole: 'admin',
        },
        {
          title: 'Créer un utilisateur',
          ref: '/admin/users/new',
          minRole: 'admin',
        },
      ],
    },
  ];

  const canAccessLink = (minRole?: StaffRole) =>
    hasAtLeastRole(staffRole, minRole ?? 'admin');

  const visibleAdminLinks: AdminLink[] = adminLinks
    .map((item) => {
      const itemMinRole = item.minRole ?? 'admin';
      const children =
        item.children
          ?.map((child) => ({
            ...child,
            minRole: child.minRole ?? itemMinRole,
          }))
          .filter((child) => canAccessLink(child.minRole)) ?? [];

      const selfAccessible = item.ref && canAccessLink(itemMinRole);
      if (!selfAccessible && children.length === 0) return null;

      return {
        ...item,
        children,
      };
    })
    .filter(Boolean) as AdminLink[];

  const headerOffset = !adminLoading && isStaff ? ADMIN_BAR_HEIGHT : 0;
  const headerHeight = NAV_HEIGHT + headerOffset;

  const handleLogout = () => {
    // Ferme tous les menus et envoie vers la page de logout
    setAdminMenuOpen(false);
    setDrop(false);
    setIsStaff(false);
    setStaffRole(null);
    setStaffName(null);
    window.location.href = '/admin/logout';
  };

  return (
    <div className="relative">
      {!adminLoading && isStaff && (
        <AdminTopBar
          staffName={staffName}
          staffRole={staffRole}
          links={visibleAdminLinks}
          height={ADMIN_BAR_HEIGHT}
          onLogout={handleLogout}
        />
      )}
      <div
        className={`fixed inset-x-0 z-[100] text-white ${
          !isStaff ? 'backdrop-blur' : ''
        } ${drop && 'bg-[#1B1130]/90'}`}
        style={{ top: headerOffset }}
      >
        <div className={!isStaff ? "mx-auto max-w-7xl px-4 py-5 flex justify-between h-[75px] w-full items-center" : ""}>
          <div
            className="flex items-center sm:justify-between sm:w-full z-[99]"
            data-test="nav-Home"
          >
            <Link href="/">
              <div className={`flex items-center cursor-pointer shrink-0 ${isStaff ? 'hidden' : ''}`}>
                <Image
                  src="/img/logos/2025-logo.png"
                  alt="conference logo"
                  width={150}
                  height={33}
                  className="block"
                  priority
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
              {/* Liens publics existants - masqués quand staff connecté */}
              {!isStaff &&
                links
                  .filter(
                    (link) =>
                      ![
                        'À propos',
                        'Cast',
                        'Sponsors',
                        'Équipes',
                        'Equipes',
                      ].includes(link.title)
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
                                  setShow(
                                    show === link.title ? null : link.title
                                  );
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
                                    show === link.title
                                      ? 'rotate-180'
                                      : 'rotate-0'
                                  }`}
                                />
                              )}
                            </button>
                          ) : (
                            <Link
                              href={link.ref ?? '#'}
                              className="whitespace-nowrap"
                            >
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
                            {link.subMenu.map(
                              (subL: LinkItem, index: number) => (
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
                                  } min-h-[32px] text-[16px] hover:scale-95 hover:translate-x-1 transition-all focus:outline-none focus:bg-white focus:bg-opacity-20 focus:scale-95 focus:translate-x-1 rounded px-2 py-1 gap-2`}
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
                                        ?.parentElement?.querySelector(
                                          'button'
                                        );
                                      (button as HTMLButtonElement)?.focus();
                                    }

                                    if (e.key === 'Tab') {
                                      setShow(null);
                                      setFocusedSubMenuItem(-1);
                                    }
                                  }}
                                >
                                  <span>{subL.title}</span>
                                  {subL.badge && (
                                    <span className="inline-flex items-center rounded-full bg-red-500/90 px-2 py-[2px] text-[11px] font-semibold uppercase tracking-wide text-white">
                                      {subL.badge}
                                    </span>
                                  )}
                                </Link>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

              {/* ------------------------------------------------
                  🔐 Zone Connexion staff (desktop only) - masquée si connecté
                 ------------------------------------------------ */}
              {!isStaff && (
                <div className="ml-10">
                  {!adminLoading && (
                    <Link
                      href="/admin/login"
                      className="text-sm border border-red-500/80 rounded-full px-3 py-1 hover:bg-red-500/20 hover:border-red-300 transition-colors text-red-300 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Connexion
                    </Link>
                  )}
                </div>
              )}
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
                  adminLinks={visibleAdminLinks}
                  adminLoading={adminLoading}
                  offsetTop={headerHeight}
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

type AdminTopBarProps = {
  staffName: string | null;
  staffRole: StaffRole | null;
  links: AdminLink[];
  height: number;
  onLogout: () => void;
};

function AdminTopBar({
  staffName,
  staffRole,
  links,
  height,
  onLogout,
}: AdminTopBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
  const menuAreaRef = useRef<HTMLDivElement>(null);
  const flatLinks =
    links.flatMap((item) => {
      if (item.children?.length) {
        return item.children.map((child) => ({
          title: child.title,
          ref: child.ref,
        }));
      }
      if (item.ref) {
        return [
          {
            title: item.title,
            ref: item.ref,
          },
        ];
      }
      return [];
    }) || [];

  if (flatLinks.length === 0) return null;

  const categories = links.filter((item) => item.children?.length);
  const singleLinks = links.filter(
    (item) => !item.children?.length && item.ref
  );

  const toggleMenu = (title: string) => {
    setOpenMenu((prev) => (prev === title ? null : title));
    setOpenSubMenu(null);
  };

  const toggleSubMenu = (title: string) => {
    setOpenSubMenu((prev) => (prev === title ? null : title));
  };

  useEffect(() => {
    if (!openMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuAreaRef.current &&
        !menuAreaRef.current.contains(e.target as Node)
      ) {
        setOpenMenu(null);
        setOpenSubMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  return (
    <div
      className="fixed inset-x-0 top-0 z-[120] bg-neutral-950/98 border-b border-neutral-800 backdrop-blur-xl"
      style={{ height, minHeight: height }}
    >
      <div className="mx-auto max-w-7xl px-4 h-full flex items-center gap-4 text-[13px] text-white">
        <Link
          href="/"
          className="flex items-center h-full pr-4 border-r border-neutral-800 mr-1 shrink-0"
        >
          <Image
            src="/img/logos/2025-logo.png"
            alt="conference logo"
            width={150}
            height={38}
            className="h-8 w-auto block"
            priority
          />
        </Link>
        <div className="flex items-center gap-3 pr-4 border-r border-neutral-800 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-neutral-200">{staffName || 'Staff'}</span>
          </div>
          {staffRole && (
            <span className="px-2 py-0.5 rounded-md bg-neutral-800 text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
              {formatStaffRoleLabel(staffRole)}
            </span>
          )}
        </div>
        <div
          ref={menuAreaRef}
          className="flex items-center gap-1 whitespace-nowrap flex-1 relative overflow-visible"
        >
          {singleLinks.map((link) => (
            <Link
              key={link.ref}
              href={link.ref}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              {link.title}
            </Link>
          ))}
          {categories.map((cat) => (
            <div key={cat.title} className="relative">
              <button
                onClick={() => toggleMenu(cat.title)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors ${
                  openMenu === cat.title
                    ? 'text-white bg-neutral-800'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                }`}
                aria-expanded={openMenu === cat.title}
                aria-haspopup="true"
              >
                {cat.title}
                <svg
                  className={`w-3 h-3 transition-transform ${
                    openMenu === cat.title ? 'rotate-180' : 'rotate-0'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openMenu === cat.title && (
                <div className="absolute left-0 top-[calc(100%+8px)] min-w-[220px] rounded-xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden z-[130]">
                  {cat.children?.map((child) => {
                    const hasNestedChildren = child.children && child.children.length > 0;

                    if (hasNestedChildren) {
                      return (
                        <div key={child.title} className="border-b border-neutral-800 last:border-b-0">
                          <button
                            onClick={() => toggleSubMenu(child.title)}
                            className={`w-full px-4 py-2.5 text-[13px] flex items-center justify-between transition-colors ${
                              openSubMenu === child.title
                                ? 'text-white bg-neutral-800'
                                : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                            }`}
                          >
                            <span>{child.title}</span>
                            <svg
                              className={`w-3 h-3 transition-transform ${
                                openSubMenu === child.title ? 'rotate-180' : 'rotate-0'
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {openSubMenu === child.title && (
                            <div className="bg-neutral-950/50">
                              {child.children?.map((subChild) => (
                                <Link
                                  key={subChild.ref}
                                  href={subChild.ref}
                                  className="block pl-8 pr-4 py-2 text-[12px] text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                                  onClick={() => {
                                    setOpenMenu(null);
                                    setOpenSubMenu(null);
                                  }}
                                >
                                  {subChild.title}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={child.ref}
                        href={child.ref}
                        className="block px-4 py-2.5 text-[13px] text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
                        onClick={() => {
                          setOpenMenu(null);
                          setOpenSubMenu(null);
                        }}
                      >
                        {child.title}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={onLogout}
          className="text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap font-medium"
        >
          Déconnexion
        </button>
      </div>
    </div>
  );
}

export default Navbar;
