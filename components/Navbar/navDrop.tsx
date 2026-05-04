import { forwardRef, useEffect, useState, type JSX } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import links from '@/config/links.json';
import type { LinkItem } from '@/types/types';
import type { INavDropProp } from '@/types/components';

const HIDDEN_PUBLIC_LINKS = new Set([
  'À propos',
  'Cast',
  'Sponsors',
  'Équipes',
  'Equipes',
]);

function Chevron({ open, size = 'md' }: { open: boolean; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  return (
    <svg
      aria-hidden
      className={`${cls} shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
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

const NavDrop = forwardRef<HTMLDivElement, INavDropProp>(function NavDrop(
  {
    setDrop,
    isStaff,
    staffName,
    adminLinks,
    adminLoading,
    offsetTop = 74,
    onLogout,
  },
  ref
): JSX.Element {
  const router = useRouter();
  const [openPublic, setOpenPublic] = useState<string | null>(null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [expandedAdminSubs, setExpandedAdminSubs] = useState<Set<string>>(
    () => new Set()
  );
  const dropHeight = `calc(100vh - ${offsetTop}px)`;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrop(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [setDrop]);

  const toggleAdminSub = (title: string) => {
    setExpandedAdminSubs((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const closeAndNavigate = () => setDrop(false);

  const publicLinks = links.filter(
    (link) => !HIDDEN_PUBLIC_LINKS.has(link.title)
  );

  return (
    <div
      ref={ref}
      className="absolute inset-x-0 z-[99] bg-gradient-to-b from-[#1B1130]/95 to-[#0F0820]/95 backdrop-blur-2xl"
      style={{ top: offsetTop, height: dropHeight }}
      role="dialog"
      aria-label="Menu mobile"
    >
      <div
        className="flex h-full w-full flex-col gap-2 overflow-y-auto px-5 pb-10 pt-6"
        style={{ maxHeight: dropHeight }}
      >
        {!isStaff && (
          <div
            className={`mb-2 flex flex-col gap-2 transition-opacity ${adminLoading ? 'opacity-0' : 'opacity-100'}`}
          >
            <Link
              href="/admin/login"
              onClick={closeAndNavigate}
              className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/[0.08]"
            >
              <span className="flex items-center gap-3">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
                <span className="text-[15px] font-medium">Connexion staff</span>
              </span>
              <svg
                aria-hidden
                className="h-4 w-4 -translate-x-1 text-neutral-300 transition-transform group-hover:translate-x-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </Link>
            <Link
              href="/register"
              onClick={closeAndNavigate}
              className="group flex items-center justify-between rounded-xl border border-fuchsia-400/30 bg-gradient-to-r from-fuchsia-500/15 to-purple-500/15 px-4 py-3 text-white backdrop-blur-md transition-all hover:border-fuchsia-400/50 hover:from-fuchsia-500/25 hover:to-purple-500/25"
            >
              <span className="text-[15px] font-semibold">Créer un compte</span>
              <svg
                aria-hidden
                className="h-4 w-4 -translate-x-1 text-fuchsia-200 transition-transform group-hover:translate-x-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </Link>
          </div>
        )}

        {isStaff && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setAdminMenuOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] px-4 py-3 text-white transition-all hover:border-emerald-400/50 hover:bg-emerald-500/[0.12]"
              aria-expanded={adminMenuOpen}
            >
              <span className="flex items-center gap-3">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-[15px] font-medium">
                  {staffName || 'Staff'}
                </span>
              </span>
              <Chevron open={adminMenuOpen} />
            </button>

            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                adminMenuOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="overflow-hidden">
                <div className="mt-3 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                  {adminLinks.map((item) =>
                    item.children && item.children.length > 0 ? (
                      <div
                        key={item.title}
                        className="border-b border-white/5 last:border-b-0"
                      >
                        <div className="bg-white/[0.04] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-200/70">
                          {item.title}
                        </div>
                        {item.children.map((child) => {
                          const hasNested =
                            child.children && child.children.length > 0;
                          if (hasNested) {
                            const expanded = expandedAdminSubs.has(child.title);
                            return (
                              <div key={child.title}>
                                <button
                                  type="button"
                                  onClick={() => toggleAdminSub(child.title)}
                                  className="flex w-full items-center justify-between px-5 py-3 text-[14px] text-white transition-colors hover:bg-white/[0.06]"
                                  aria-expanded={expanded}
                                >
                                  <span>{child.title}</span>
                                  <Chevron open={expanded} size="sm" />
                                </button>
                                <div
                                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                                    expanded
                                      ? 'grid-rows-[1fr]'
                                      : 'grid-rows-[0fr]'
                                  }`}
                                >
                                  <div className="overflow-hidden">
                                    <div className="bg-black/20">
                                      {child.children?.map((subChild) => (
                                        <Link
                                          key={subChild.ref}
                                          href={subChild.ref}
                                          onClick={closeAndNavigate}
                                          className="block py-2.5 pl-10 pr-5 text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white"
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
                            <Link
                              key={child.ref || child.title}
                              href={child.ref || '#'}
                              onClick={closeAndNavigate}
                              className="block px-5 py-3 text-[14px] text-white transition-colors hover:bg-white/[0.06]"
                            >
                              {child.title}
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <Link
                        key={item.ref || item.title}
                        href={item.ref || '#'}
                        onClick={closeAndNavigate}
                        className="block border-b border-white/5 px-4 py-3 text-[14px] text-white transition-colors hover:bg-white/[0.06] last:border-b-0"
                      >
                        {item.title}
                      </Link>
                    )
                  )}

                  <button
                    type="button"
                    onClick={onLogout}
                    className="border-t border-white/10 px-4 py-3 text-left text-[13px] text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
                  >
                    Déconnexion
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-col gap-1">
          {publicLinks.map((link: LinkItem) => {
            const hasSubMenu = !!link.subMenu;
            const isOpen = openPublic === link.title;
            const isActive =
              (!hasSubMenu && router.pathname === link.ref) ||
              (hasSubMenu &&
                link.subMenu!.some((s) => s.ref && router.pathname === s.ref));

            if (!hasSubMenu) {
              return (
                <Link
                  key={link.title}
                  href={link.ref || '#'}
                  onClick={closeAndNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-[48px] items-center rounded-lg px-4 text-[15px] font-medium transition-all ${
                    isActive
                      ? 'bg-white/[0.08] text-white'
                      : 'text-neutral-200 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  {link.title}
                </Link>
              );
            }

            return (
              <div key={link.title} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setOpenPublic(isOpen ? null : link.title)}
                  className={`flex min-h-[48px] items-center justify-between rounded-lg px-4 text-[15px] font-medium transition-all ${
                    isActive
                      ? 'bg-white/[0.08] text-white'
                      : 'text-neutral-200 hover:bg-white/[0.04] hover:text-white'
                  }`}
                  aria-expanded={isOpen}
                >
                  <span>{link.title}</span>
                  <Chevron open={isOpen} />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-white/10 pl-3">
                      {link.subMenu!.map((sub) => (
                        <Link
                          key={sub.ref ?? sub.title}
                          href={sub.ref || '#'}
                          onClick={closeAndNavigate}
                          className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-[14px] text-neutral-300 transition-all hover:bg-white/[0.06] hover:text-white"
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
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

NavDrop.displayName = 'NavDrop';

export default NavDrop;
