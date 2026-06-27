import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import linksConfig from '@/config/links.json';
import type { LinkItem } from '@/types/types';
import type { PlayerLink } from './playerLinks';

const SITE_MENU_KEY = '__site__';

type PlayerTopBarProps = {
  playerName: string | null;
  roleLabel: string | null;
  links: PlayerLink[];
  height: number;
  onLogout: () => void;
};

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      className={`h-3 w-3 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
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
  );
}

export default function PlayerTopBar({
  playerName,
  roleLabel,
  links,
  height,
  onLogout,
}: PlayerTopBarProps) {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuAreaRef.current &&
        !menuAreaRef.current.contains(e.target as Node)
      ) {
        setOpenMenu(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [openMenu]);

  const publicLinks: { title: string; ref: string }[] = [];
  for (const link of linksConfig as LinkItem[]) {
    if (link.subMenu) {
      for (const sub of link.subMenu) {
        if (sub.ref)
          publicLinks.push({
            title: `${link.title} – ${sub.title}`,
            ref: sub.ref,
          });
      }
    } else if (link.ref) {
      publicLinks.push({ title: link.title, ref: link.ref });
    }
  }

  const toggleMenu = (title: string) => {
    setOpenMenu((prev) => (prev === title ? null : title));
  };
  const closeAll = () => {
    setOpenMenu(null);
  };

  const isActive = (ref: string) => {
    if (ref === '/player') return router.pathname === '/player';
    return router.pathname === ref;
  };

  return (
    <div
      className="fixed inset-x-0 top-0 z-[120] border-b border-white/[0.06] bg-neutral-950/80 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)]"
      style={{ height, minHeight: height }}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center gap-4 px-4 text-[13px] text-white">
        <Link
          href="/"
          className="flex h-full shrink-0 items-center border-r border-white/[0.06] pr-4"
          aria-label="Accueil"
        >
          <Image
            src="/img/logos/2025-logo.png"
            alt="conference logo"
            width={150}
            height={38}
            className="block h-8 w-auto transition-transform duration-300 hover:scale-[1.03]"
            priority
          />
        </Link>

        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap border-r border-white/[0.06] pr-4">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium text-neutral-100">
            {playerName || 'Joueur'}
          </span>
          {roleLabel && (
            <span className="rounded-md border border-purple-400/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-purple-200">
              {roleLabel}
            </span>
          )}
        </div>

        <div
          ref={menuAreaRef}
          className="relative flex flex-1 items-center gap-1 overflow-visible whitespace-nowrap"
        >
          <DropdownButton
            label="Site"
            open={openMenu === SITE_MENU_KEY}
            onToggle={() => toggleMenu(SITE_MENU_KEY)}
          />
          <DropdownPanel open={openMenu === SITE_MENU_KEY}>
            {publicLinks.map((pl) => (
              <PanelLink key={pl.ref} href={pl.ref} onNavigate={closeAll}>
                {pl.title}
              </PanelLink>
            ))}
          </DropdownPanel>

          <span className="mx-1 h-5 w-px bg-white/[0.06]" />

          {links.map((link) => {
            const active = isActive(link.ref);
            return (
              <Link
                key={link.ref}
                href={link.ref}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                  active
                    ? 'bg-purple-500/15 text-white'
                    : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {link.title}
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400 transition-all hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
        >
          Déconnexion
        </button>
      </div>
    </div>
  );
}

function DropdownButton({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
        open
          ? 'bg-white/[0.08] text-white'
          : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
      }`}
      aria-expanded={open}
      aria-haspopup="true"
    >
      {label}
      <ChevronDown open={open} />
    </button>
  );
}

function DropdownPanel({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute left-0 top-[calc(100%+8px)] z-[130] min-w-[220px] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out ${
        open
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none -translate-y-1 opacity-0'
      }`}
      role="menu"
      aria-hidden={!open}
    >
      {children}
    </div>
  );
}

function PanelLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="block px-4 py-2.5 text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white"
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}
