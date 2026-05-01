import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import linksConfig from '@/config/links.json';
import type { LinkItem } from '@/types/types';
import type { AdminLink } from '@/types/components';
import { formatStaffRoleLabel, type StaffRole } from '@/utils/staff';

const SITE_MENU_KEY = '__site__';

type AdminTopBarProps = {
  staffName: string | null;
  staffRole: StaffRole | null;
  links: AdminLink[];
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

export default function AdminTopBar({
  staffName,
  staffRole,
  links,
  height,
  onLogout,
}: AdminTopBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
  const menuAreaRef = useRef<HTMLDivElement>(null);

  const [alertsCount, setAlertsCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/admin/alerts-summary');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && typeof json?.total === 'number') {
          setAlertsCount(json.total);
        }
      } catch {
        // silent — pas d'incidence sur l'UX si ça plante
      }
    }
    poll();
    const interval = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      poll();
    }, 90_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

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
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setOpenSubMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [openMenu]);

  const categories = links.filter((item) => item.children?.length);
  const singleLinks = links.filter(
    (item) => !item.children?.length && item.ref
  );
  if (categories.length === 0 && singleLinks.length === 0) return null;

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
    setOpenSubMenu(null);
  };
  const toggleSubMenu = (title: string) => {
    setOpenSubMenu((prev) => (prev === title ? null : title));
  };
  const closeAll = () => {
    setOpenMenu(null);
    setOpenSubMenu(null);
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
            {staffName || 'Staff'}
          </span>
          {staffRole && (
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-300">
              {formatStaffRoleLabel(staffRole)}
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

          {singleLinks.map((link) => {
            const isCurrentTournament = link.ref === '/admin/tournoi-en-cours';
            const showBadge =
              isCurrentTournament &&
              typeof alertsCount === 'number' &&
              alertsCount > 0;
            return (
              <Link
                key={link.ref}
                href={link.ref}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-neutral-300 transition-all hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                {link.title}
                {showBadge && (
                  <span
                    title={`${alertsCount} alerte${alertsCount! > 1 ? 's' : ''} active${alertsCount! > 1 ? 's' : ''}`}
                    className={`relative inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
                      alertsCount! >= 5
                        ? 'bg-red-500 text-white shadow-[0_0_0_2px_rgba(239,68,68,0.25)]'
                        : 'bg-amber-500 text-neutral-950 shadow-[0_0_0_2px_rgba(245,158,11,0.25)]'
                    }`}
                  >
                    {alertsCount! >= 5 && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-red-500/60" />
                    )}
                    <span className="relative">
                      {alertsCount! > 99 ? '99+' : alertsCount}
                    </span>
                  </span>
                )}
              </Link>
            );
          })}

          {categories.map((cat) => (
            <div key={cat.title} className="relative">
              <DropdownButton
                label={cat.title}
                open={openMenu === cat.title}
                onToggle={() => toggleMenu(cat.title)}
              />
              <DropdownPanel open={openMenu === cat.title}>
                {cat.children?.map((child) => {
                  const hasNested = child.children && child.children.length > 0;
                  if (hasNested) {
                    const isExpanded = openSubMenu === child.title;
                    return (
                      <div
                        key={child.title}
                        className="border-b border-white/5 last:border-b-0"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSubMenu(child.title)}
                          className={`flex w-full items-center justify-between px-4 py-2.5 text-[13px] transition-colors ${
                            isExpanded
                              ? 'bg-white/[0.06] text-white'
                              : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
                          }`}
                          aria-expanded={isExpanded}
                        >
                          <span>{child.title}</span>
                          <ChevronDown open={isExpanded} />
                        </button>
                        <div
                          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div className="bg-black/30">
                              {child.children?.map((subChild) => (
                                <Link
                                  key={subChild.ref}
                                  href={subChild.ref}
                                  className="block py-2 pl-8 pr-4 text-[12px] text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                                  onClick={closeAll}
                                >
                                  {subChild.title}
                                </Link>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <PanelLink
                      key={child.ref}
                      href={child.ref}
                      onNavigate={closeAll}
                    >
                      {child.title}
                    </PanelLink>
                  );
                })}
              </DropdownPanel>
            </div>
          ))}
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
