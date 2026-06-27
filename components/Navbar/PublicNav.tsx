import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import linksConfig from '@/config/links.json';
import type { LinkItem } from '@/types/types';
import { useAuthSession } from '@/hooks/useAuthSession';
import PlayerBell from './PlayerBell';

const HIDDEN_PUBLIC_LINKS = new Set(['À propos', 'Cast', 'Sponsors']);

type PublicNavProps = {
  staffLoading: boolean;
  showStaffLogin: boolean;
};

export default function PublicNav({
  staffLoading,
  showStaffLogin,
}: PublicNavProps) {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuthSession();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubMenuHovered = useRef(false);
  const subMenuRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const triggerRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const closeMenu = useCallback(() => {
    setOpenMenu(null);
    setFocusedIndex(-1);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (openMenu && !target.closest('[data-public-submenu]')) closeMenu();
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openMenu, closeMenu]);

  useEffect(() => {
    if (focusedIndex >= 0) subMenuRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, openMenu]);

  const handleHoverEnter = (title: string) => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    setOpenMenu(title);
  };

  const handleHoverLeave = () => {
    closeTimeout.current = setTimeout(() => {
      if (!isSubMenuHovered.current) closeMenu();
    }, 200);
  };

  const handleSubMenuEnter = () => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    isSubMenuHovered.current = true;
  };

  const handleSubMenuLeave = () => {
    isSubMenuHovered.current = false;
    closeMenu();
  };

  const links = linksConfig.filter(
    (link) => !HIDDEN_PUBLIC_LINKS.has(link.title)
  );

  return (
    <div className="flex items-center gap-2">
      {links.map((link: LinkItem) => {
        const hasSubMenu = !!link.subMenu;
        const isOpen = openMenu === link.title;
        const isActive =
          (!hasSubMenu && router.pathname === link.ref) ||
          (hasSubMenu &&
            link.subMenu!.some((s) => s.ref && router.pathname === s.ref));

        return (
          <div
            key={link.title}
            data-public-submenu
            data-test={`nav-${link.title}`}
            className="relative"
            onMouseEnter={() => handleHoverEnter(link.title)}
            onMouseLeave={handleHoverLeave}
          >
            {hasSubMenu ? (
              <button
                ref={(el) => {
                  triggerRefs.current.set(link.title, el);
                }}
                type="button"
                className={`group/link relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-[14px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                  isActive ? 'text-white' : 'text-neutral-200 hover:text-white'
                }`}
                onClick={() => setOpenMenu(isOpen ? null : link.title)}
                onKeyDown={(e) => {
                  const max = link.subMenu!.length - 1;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenMenu(isOpen ? null : link.title);
                    if (!isOpen) setFocusedIndex(0);
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setOpenMenu(link.title);
                    setFocusedIndex(0);
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setOpenMenu(link.title);
                    setFocusedIndex(max);
                  }
                  if (e.key === 'Escape') closeMenu();
                }}
                aria-expanded={isOpen}
                aria-haspopup="true"
              >
                <span>{link.title}</span>
                <svg
                  aria-hidden
                  className={`h-3 w-3 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
                <Underline active={isActive} />
              </button>
            ) : (
              <Link
                href={link.ref ?? '#'}
                aria-current={isActive ? 'page' : undefined}
                className={`group/link relative inline-flex items-center rounded-lg px-3 py-2 text-[14px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                  isActive ? 'text-white' : 'text-neutral-200 hover:text-white'
                }`}
              >
                <span>{link.title}</span>
                <Underline active={isActive} />
              </Link>
            )}

            {hasSubMenu && (
              <div
                onMouseEnter={handleSubMenuEnter}
                onMouseLeave={handleSubMenuLeave}
                className={`absolute left-1/2 top-[calc(100%+10px)] z-[110] -translate-x-1/2 min-w-[180px] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-all duration-200 ease-out ${
                  isOpen
                    ? 'pointer-events-auto translate-y-0 opacity-100'
                    : 'pointer-events-none -translate-y-1 opacity-0'
                }`}
                role="menu"
                aria-hidden={!isOpen}
              >
                <div className="flex flex-col py-1">
                  {link.subMenu!.map((sub: LinkItem, index: number) => (
                    <Link
                      key={sub.title}
                      href={sub.ref ?? '#'}
                      role="menuitem"
                      ref={(el) => {
                        subMenuRefs.current[index] = el;
                      }}
                      data-test={`nav-sub-${sub.title}`}
                      className="group/sub flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06] focus:text-white focus:outline-none"
                      onKeyDown={(e) => {
                        const max = link.subMenu!.length - 1;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setFocusedIndex(index === max ? 0 : index + 1);
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setFocusedIndex(index === 0 ? max : index - 1);
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          closeMenu();
                          triggerRefs.current.get(link.title)?.focus();
                        }
                        if (e.key === 'Tab') closeMenu();
                      }}
                    >
                      <span>{sub.title}</span>
                      {sub.badge && (
                        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-500 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-white shadow-[0_0_12px_-2px_rgba(217,70,239,0.6)]">
                          {sub.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Link
        href="/don"
        data-test="nav-Don"
        aria-current={router.pathname === '/don' ? 'page' : undefined}
        className="group/don ml-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[14px] font-medium text-neutral-200 transition-all hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <svg
          aria-hidden
          className="h-4 w-4 text-rose-400 transition-transform duration-300 group-hover/don:scale-110"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 21s-6.716-4.297-9.193-7.6C1.07 11.13 1.4 8.07 3.6 6.43c1.9-1.42 4.46-1 5.9.72L12 10.2l2.5-3.05c1.44-1.72 4-2.14 5.9-.72 2.2 1.64 2.53 4.7.793 6.97C18.716 16.703 12 21 12 21z" />
        </svg>
        <span>Soutenir</span>
      </Link>

      <PlayerBell />

      {showStaffLogin && !authUser && (
        <div
          className={`ml-3 flex shrink-0 items-center gap-2 transition-opacity ${
            staffLoading || authLoading
              ? 'pointer-events-none opacity-0'
              : 'opacity-100'
          }`}
        >
          <Link
            href="/admin/login"
            className="group/login hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[13px] font-medium text-neutral-200 backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 min-[1280px]:inline-flex"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            <span>Connexion</span>
          </Link>
          <Link
            href="/register"
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[13px] font-medium text-neutral-200 backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <span>Créer un compte</span>
          </Link>
          <Link
            href="/inscription-2026"
            data-test="nav-Inscription"
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-fuchsia-400/40 bg-gradient-to-r from-fuchsia-500 to-purple-500 px-4 py-1.5 text-[13px] font-semibold text-white shadow-[0_0_20px_-6px_rgba(217,70,239,0.7)] transition-all hover:from-fuchsia-400 hover:to-purple-400 hover:shadow-[0_0_24px_-4px_rgba(217,70,239,0.85)] focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50"
          >
            <span>Inscription</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function Underline({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-3 -bottom-px h-px origin-center bg-gradient-to-r from-transparent via-white/80 to-transparent transition-transform duration-300 ${
        active ? 'scale-x-100' : 'scale-x-0 group-hover/link:scale-x-100'
      }`}
    />
  );
}
