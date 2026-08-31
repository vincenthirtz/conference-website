/* eslint-disable @next/next/no-img-element */
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import linksConfig from '@/config/links.json';
import type { LinkItem } from '@/types/types';
import type { PlayerLink } from './playerLinks';
import type { PlayerNotificationsPayload } from '@/pages/api/player/notifications';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import LanguageToggle from './LanguageToggle';
import { useT, format } from '@/lib/i18n/useT';
import { useTenantBranding } from '@/lib/branding/TenantBrandingProvider';
import nsPlayerTopBar from '@/lib/i18n/locales/fr/playerTopBar';
import { useDocumentVisible } from '@/hooks/useDocumentVisible';

const SITE_MENU_KEY = '__site__';
const MOBILE_MENU_KEY = '__mobile__';

type PlayerTopBarProps = {
  playerName: string | null;
  roleLabel: string | null;
  links: PlayerLink[];
  height: number;
  onLogout: () => void;
  avatarUrl?: string | null;
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

function BellIcon() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function Initials({ name }: { name: string | null }) {
  const initials = (name || 'J')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-purple-400/30 bg-purple-500/20 text-[10px] font-semibold text-purple-100">
      {initials || 'J'}
    </span>
  );
}

export default function PlayerTopBar({
  playerName,
  roleLabel,
  links,
  height,
  onLogout,
  avatarUrl,
}: PlayerTopBarProps) {
  const t = useT(nsPlayerTopBar);
  const branding = useTenantBranding();
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuAreaRef = useRef<HTMLDivElement>(null);
  const mobileAreaRef = useRef<HTMLDivElement>(null);
  const drawerRef = useFocusTrap<HTMLDivElement>();

  const [notifTotal, setNotifTotal] = useState<number | null>(null);
  const visible = useDocumentVisible();

  const poll = useCallback(async () => {
    try {
      const json = await adminFetchJson<PlayerNotificationsPayload>(
        '/api/player/notifications',
        { skipAuthRedirect: true }
      );
      if (typeof json?.total === 'number') {
        setNotifTotal(json.total);
      }
    } catch {
      // silent — pas d'incidence sur l'UX si ça plante
    }
  }, [adminFetchJson]);

  // Onglet caché = pas de poll. Au retour, l'effet se relance et rafraîchit
  // IMMÉDIATEMENT le compteur, au lieu d'attendre le prochain cycle de 90 s.
  useEffect(() => {
    if (!visible) return undefined;
    poll();
    const interval = setInterval(poll, 90_000);
    return () => {
      clearInterval(interval);
    };
  }, [poll, visible]);

  useEffect(() => {
    if (!openMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMenu = menuAreaRef.current?.contains(target);
      const inMobile = mobileAreaRef.current?.contains(target);
      if (!inMenu && !inMobile) {
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

  // Close any open menu when the route changes (mobile drawer + Site dropdown).
  useEffect(() => {
    const close = () => setOpenMenu(null);
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);

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

  const hasNotifs = typeof notifTotal === 'number' && notifTotal > 0;
  const notifBadgeLabel = notifTotal && notifTotal > 99 ? '99+' : notifTotal;
  const bellAriaLabel =
    hasNotifs && typeof notifTotal === 'number'
      ? format(t.bellPending, { count: notifTotal })
      : t.bellEmpty;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[120] border-b border-white/[0.06] bg-neutral-950/80 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)]"
      style={{ height, minHeight: height }}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 text-[13px] text-white min-[900px]:gap-4">
        <Link
          href="/"
          className="flex h-full shrink-0 items-center border-r border-white/[0.06] pr-3 min-[900px]:pr-4"
          aria-label={t.homeAria}
        >
          <Image
            src={branding?.logoUrl ?? '/img/logos/2026-logo.png'}
            alt={branding?.name ? `${branding.name} logo` : 'conference logo'}
            width={150}
            height={38}
            className="block h-8 w-auto transition-transform duration-300 hover:scale-[1.03]"
            priority
            unoptimized={Boolean(branding?.logoUrl)}
          />
        </Link>

        <div className="flex min-w-0 shrink items-center gap-2 whitespace-nowrap border-r border-white/[0.06] pr-3 min-[900px]:gap-3 min-[900px]:pr-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-6 w-6 shrink-0 rounded-full border border-purple-400/30 object-cover"
            />
          ) : (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          )}
          <span className="truncate font-medium text-neutral-100">
            {playerName || t.fallbackName}
          </span>
          {roleLabel && (
            <span className="hidden shrink-0 rounded-md border border-purple-400/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-purple-200 min-[420px]:inline-block">
              {roleLabel}
            </span>
          )}
        </div>

        {/* Desktop inline menu — tabs + Site dropdown */}
        <div
          ref={menuAreaRef}
          className="relative hidden flex-1 items-center gap-1 overflow-visible whitespace-nowrap min-[900px]:flex"
        >
          <DropdownButton
            label={t.site}
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
                {t.linkLabels[link.key]}
              </Link>
            );
          })}
        </div>

        {/* Spacer pushes the bell/hamburger to the right on mobile. */}
        <div className="flex-1 min-[900px]:hidden" />

        {/* Bascule de langue FR / EN — toujours visible (gere son propre aria-label bilingue) */}
        <LanguageToggle />

        {/* Notification bell — always visible (desktop + mobile) */}
        <Link
          href="/player/notifications"
          aria-label={bellAriaLabel}
          className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-300 transition-all hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <BellIcon />
          {hasNotifs && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_rgba(178,75,224,0.25)]">
              {notifBadgeLabel}
            </span>
          )}
        </Link>

        {/* Desktop logout */}
        <button
          type="button"
          onClick={onLogout}
          className="hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400 transition-all hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 min-[900px]:inline-flex"
        >
          {t.logout}
        </button>

        {/* Mobile hamburger + panel */}
        <div ref={mobileAreaRef} className="relative min-[900px]:hidden">
          <button
            type="button"
            aria-label={openMenu === MOBILE_MENU_KEY ? t.closeMenu : t.openMenu}
            aria-expanded={openMenu === MOBILE_MENU_KEY}
            aria-haspopup="true"
            onClick={() => toggleMenu(MOBILE_MENU_KEY)}
            className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
              openMenu === MOBILE_MENU_KEY
                ? 'bg-white/[0.08] text-white'
                : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <span className="relative block h-4 w-5">
              <span
                className={`absolute left-0 top-0 h-[2px] w-full rounded-full bg-current transition-all duration-300 ${
                  openMenu === MOBILE_MENU_KEY
                    ? 'translate-y-[7px] rotate-45'
                    : ''
                }`}
              />
              <span
                className={`absolute left-0 top-[7px] h-[2px] w-full rounded-full bg-current transition-all duration-300 ${
                  openMenu === MOBILE_MENU_KEY ? 'opacity-0' : 'opacity-100'
                }`}
              />
              <span
                className={`absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-current transition-all duration-300 ${
                  openMenu === MOBILE_MENU_KEY
                    ? '-translate-y-[7px] -rotate-45'
                    : ''
                }`}
              />
            </span>
          </button>

          {openMenu === MOBILE_MENU_KEY && (
            <div
              ref={drawerRef}
              className="absolute right-0 top-[calc(100%+8px)] z-[130] w-[min(85vw,300px)] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 shadow-2xl backdrop-blur-xl"
              role="menu"
            >
              <div className="py-1">
                {links.map((link) => {
                  const active = isActive(link.ref);
                  return (
                    <Link
                      key={link.ref}
                      href={link.ref}
                      role="menuitem"
                      aria-current={active ? 'page' : undefined}
                      onClick={closeAll}
                      className={`block px-4 py-2.5 text-[13px] font-medium transition-colors ${
                        active
                          ? 'bg-purple-500/15 text-white'
                          : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      {t.linkLabels[link.key]}
                    </Link>
                  );
                })}
              </div>

              <div className="border-t border-white/10">
                <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  {t.site}
                </div>
                {publicLinks.map((pl) => (
                  <PanelLink key={pl.ref} href={pl.ref} onNavigate={closeAll}>
                    {pl.title}
                  </PanelLink>
                ))}
              </div>

              <div className="border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    closeAll();
                    onLogout();
                  }}
                  className="block w-full px-4 py-2.5 text-left text-[12px] font-medium uppercase tracking-wide text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  {t.logout}
                </button>
              </div>
            </div>
          )}
        </div>
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
