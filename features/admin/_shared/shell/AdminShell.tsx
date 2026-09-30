// features/admin/_shared/shell/AdminShell.tsx — la coquille de l'espace admin en
// « Le Ruban » (planches Admin*, canvas du 2026-09-05 ; pose du 2026-09-29).
//
// Remplace l'ancienne barre à menus déroulants (AdminTopBar) par :
//   * une barre latérale fixe, une section par entrée du menu (`ADMIN_NAV`),
//     ses liens dessous — tout le menu visible d'un coup d'œil, sans survol ;
//   * un bandeau haut : fil d'Ariane, badge d'alertes, rôle, profil.
//
// Rien ne change côté droits : la coquille reçoit les liens DÉJÀ filtrés par
// `filterAdminLinks` (navbar.tsx), comme la barre qu'elle remplace.
//
// Sous `lg`, la barre latérale devient un tiroir ouvert depuis le bandeau.

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import type { AdminLink } from '@/types/components';
import { formatStaffRoleLabel, type StaffRole } from '@/utils/staffRoles';
import { useT, format } from '@/lib/i18n/useT';
import { useTenantBranding } from '@/lib/branding/TenantBrandingProvider';
import ProfileModal from '@/components/admin/profile/ProfileModal';
import nsAdminTopBar from '@/lib/i18n/locales/fr/adminTopBar';
import { isAdminLinkActive } from '@/components/Navbar/headerBars';
import { ADMIN_NAV_TRAILS } from '@/components/admin/navigation/adminNavTrail';
import { useAdminCrumbs } from '@/components/admin/AdminBreadcrumbs';
import { useAdminAlertsCount } from '@/hooks/admin/useAdminAlertsCount';
import { openCommandPalette } from '@/components/admin/commandPaletteEvents';
import AdminMenuIcon from '@/components/admin/navigation/adminMenuIcons';

export type AdminShellProps = {
  staffName: string | null;
  staffRole: StaffRole | null;
  links: AdminLink[];
  /**
   * Hauteur du bandeau. navbar.tsx la publie aussi dans `--app-header-h`, que
   * le bandeau lit : c'est la même valeur que `pt-header` des pages.
   */
  height: number;
  onLogout: () => void;
  accountLinks?: { key: string; href: string; label: string }[];
};

const eyebrow =
  'font-[family-name:var(--fd)] [font-stretch:75%] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t4)]';

function NavItem({
  link,
  depth,
  onNavigate,
}: {
  link: AdminLink;
  depth: number;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const children = link.children ?? [];
  const active =
    !!link.ref && isAdminLinkActive(router.pathname, { ref: link.ref });
  // Une sous-section (Tournois, Scrims, Équipes…) est REPLIÉE, comme la liste
  // plate des planches — sauf quand elle contient la page courante : on ne
  // cache jamais à quelqu'un l'endroit où il se trouve.
  const containsActive =
    children.length > 0 && isAdminLinkActive(router.pathname, link);
  const [open, setOpen] = useState(containsActive);
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);
  const pad = depth === 0 ? 'pl-[22px]' : 'pl-[38px]';
  const size = depth === 0 ? 'text-[14.5px]' : 'text-[13.5px]';
  const idle =
    'text-[var(--t2)] hover:bg-[var(--s2)]/60 hover:text-[var(--t1)]';

  if (children.length > 0) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex w-full items-center justify-between py-2 pr-4 text-left ${pad} ${size} transition-colors ${
            containsActive ? 'text-[var(--t1)]' : idle
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <AdminMenuIcon
              title={link.title}
              href={link.ref}
              isSection
              className={
                containsActive ? 'text-[var(--or)]' : 'text-[var(--t4)]'
              }
            />
            <span className="truncate">{link.title}</span>
          </span>
          <svg
            aria-hidden
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-[var(--t4)] transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path d="M9 6l6 6-6 6" strokeLinecap="round" />
          </svg>
        </button>
        {open && (
          <ul>
            {link.ref && (
              <NavItem
                link={{ ...link, children: [] }}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
            )}
            {children.map((c) => (
              <NavItem
                key={`${c.title}-${c.ref}`}
                link={c}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  if (!link.ref) return null;
  return (
    <li>
      <Link
        href={link.ref}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={`relative flex items-center gap-2.5 py-2 pr-4 ${pad} ${size} transition-colors ${
          active
            ? 'bg-[var(--s2)] text-[var(--t1)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--or)]'
            : idle
        }`}
      >
        <AdminMenuIcon
          title={link.title}
          href={link.ref}
          className={active ? 'text-[var(--or)]' : 'text-[var(--t4)]'}
        />
        <span className="min-w-0 truncate">{link.title}</span>
      </Link>
    </li>
  );
}

function SidebarContent({
  links,
  accountLinks,
  onLogout,
  onNavigate,
}: {
  links: AdminLink[];
  accountLinks: AdminShellProps['accountLinks'];
  onLogout: () => void;
  onNavigate: () => void;
}) {
  const t = useT(nsAdminTopBar);
  const branding = useTenantBranding();
  const singles = links.filter((l) => !l.children?.length && l.ref);
  const sections = links.filter((l) => l.children?.length);
  const player = (accountLinks ?? []).find((l) => l.key === 'player');

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/admin"
        onClick={onNavigate}
        className="flex items-center gap-3 border-b border-[var(--line)] px-[22px] py-5"
      >
        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-[var(--r-ctrl)] border-l-2 border-[var(--or)] bg-[var(--s2)]">
          <Image
            src={branding?.logoUrl ?? '/img/logos/2026-logo.png'}
            alt=""
            fill
            sizes="32px"
            className="object-contain p-0.5"
            unoptimized={Boolean(branding?.logoUrl)}
          />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-[var(--t1)]">
            {branding?.name ?? 'OW Women’s Cup'}
          </span>
          <span className="block text-[12px] text-[var(--t3)]">
            {t.orgKicker}
          </span>
        </span>
      </Link>

      <div className="px-[22px] pt-4">
        <button
          type="button"
          onClick={() => {
            onNavigate();
            openCommandPalette();
          }}
          aria-label={t.searchAria}
          className="flex w-full items-center justify-between rounded-[var(--r-ctrl)] border border-[var(--line2)] bg-[var(--s1)] px-3 py-2 text-left text-[13px] text-[var(--t4)] transition-colors hover:border-[var(--or)] hover:text-[var(--t2)]"
        >
          {t.search}
          <kbd className="font-mono text-[11px] text-[var(--t4)]">⌘K</kbd>
        </button>
      </div>

      <nav
        aria-label={t.shellNavAria}
        className="mt-3 flex-1 overflow-y-auto pb-6"
      >
        {singles.length > 0 && (
          <ul className="mb-2">
            {singles.map((l) => (
              <NavItem key={l.ref} link={l} depth={0} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
        {sections.map((section) => (
          <section key={section.title} className="mt-4">
            <h2 className={`px-[22px] pb-2 ${eyebrow}`}>{section.title}</h2>
            <ul>
              {section.children!.map((l) => (
                <NavItem
                  key={`${l.title}-${l.ref}`}
                  link={l}
                  depth={0}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-[var(--line)] px-[22px] py-4 text-[13px]">
        <Link
          href="/"
          onClick={onNavigate}
          className="py-1 text-[var(--t3)] hover:text-[var(--t1)]"
        >
          {t.siteLink}
        </Link>
        {player && (
          <Link
            href={player.href}
            onClick={onNavigate}
            className="py-1 text-[var(--t3)] hover:text-[var(--t1)]"
          >
            {player.label}
          </Link>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="py-1 text-left text-[var(--t3)] hover:text-[var(--err)]"
        >
          {t.logout}
        </button>
      </div>
    </div>
  );
}

export default function AdminShell({
  staffName,
  staffRole,
  links,
  onLogout,
  accountLinks = [],
}: AdminShellProps) {
  const t = useT(nsAdminTopBar);
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { count: alerts } = useAdminAlertsCount();
  const crumbs = useAdminCrumbs();
  // Page de premier niveau : le fil n'apprend rien (useAdminCrumbs est vide) ;
  // le bandeau montre alors sa place dans le menu.
  const trail =
    crumbs.length > 0 ? crumbs : (ADMIN_NAV_TRAILS[router.pathname] ?? []);

  // `/admin?profile=1` (ou tout écran avec `?profile`) ouvre le profil.
  useEffect(() => {
    if (router.query.profile != null) setProfileOpen(true);
  }, [router.query.profile]);

  const closeProfile = useCallback(() => {
    setProfileOpen(false);
    if (router.query.profile == null) return;
    const rest: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(router.query)) {
      if (key === 'profile' || value == null) continue;
      rest[key] = value;
    }
    router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true,
    });
  }, [router]);

  // Tiroir : se referme à la navigation et sur Échap.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  if (links.length === 0) return null;

  const closeDrawer = () => setDrawerOpen(false);
  const alertsLabel =
    typeof alerts === 'number' && alerts > 0
      ? format(alerts > 1 ? t.alertsActive_other : t.alertsActive_one, {
          count: alerts,
        })
      : null;

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-[120] hidden w-[var(--admin-sidebar-w)] border-r border-[var(--line)] bg-[var(--s1)] lg:block">
        <SidebarContent
          links={links}
          accountLinks={accountLinks}
          onLogout={onLogout}
          onNavigate={() => {}}
        />
      </aside>

      <header className="fixed inset-x-0 top-0 z-[119] flex h-[var(--app-header-h)] items-center gap-3 border-b border-[var(--line)] bg-[var(--canvas)]/90 px-4 backdrop-blur lg:left-[var(--admin-sidebar-w)] lg:px-[30px]">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t.openMenu}
          aria-expanded={drawerOpen}
          className="-ml-1 rounded-[var(--r-ctrl)] p-2 text-[var(--t2)] hover:bg-[var(--s2)] lg:hidden"
        >
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>

        <nav
          aria-label={t.crumbAria}
          className="hidden min-w-0 flex-1 md:block"
        >
          <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--t3)]">
            {trail.map((c, i) => (
              <li
                key={`${c.label}-${i}`}
                className="flex min-w-0 items-center gap-1.5"
              >
                {i > 0 && (
                  <span aria-hidden className="text-[var(--t4)]">
                    /
                  </span>
                )}
                {c.href && i < trail.length - 1 ? (
                  <Link
                    href={c.href}
                    className="truncate hover:text-[var(--t1)]"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex-1 md:hidden" />

        {alertsLabel && (
          <Link
            href="/admin/tournoi-en-cours"
            role="status"
            aria-label={`${alertsLabel} — ${t.alertsLink}`}
            className={`rounded-[var(--r-ctrl)] border px-2 py-1 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.14em] [font-stretch:75%] ${
              (alerts ?? 0) >= 5
                ? 'border-[var(--err)] text-[var(--err)]'
                : 'border-[var(--warn)] text-[var(--warn)]'
            }`}
          >
            <span data-numeric>{alertsLabel}</span>
          </Link>
        )}

        {staffRole && (
          <span className="hidden rounded-[var(--r-ctrl)] border border-[var(--or)] px-2 py-1 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--or-300)] [font-stretch:75%] sm:inline">
            {formatStaffRoleLabel(staffRole)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label={t.openProfileAria}
          aria-haspopup="dialog"
          title={staffName || t.staffFallback}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--or)] bg-[var(--s2)] text-[13px] font-semibold text-[var(--t1)] hover:bg-[var(--s3)]"
        >
          {(staffName || t.staffFallback).slice(0, 1).toUpperCase()}
        </button>
      </header>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-[130] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t.shellNavAria}
        >
          <button
            type="button"
            aria-label={t.closeMenu}
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-y-0 left-0 w-[min(86vw,var(--admin-sidebar-w))] border-r border-[var(--line)] bg-[var(--s1)] shadow-[var(--sh3)]">
            <SidebarContent
              links={links}
              accountLinks={accountLinks}
              onLogout={onLogout}
              onNavigate={closeDrawer}
            />
          </div>
        </div>
      )}

      <ProfileModal open={profileOpen} onClose={closeProfile} />
    </>
  );
}
