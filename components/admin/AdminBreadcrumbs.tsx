// components/admin/AdminBreadcrumbs.tsx
//
// Fil d'Ariane des pages admin profondes (refonte des menus, plan 8). Posé
// EN TÊTE du contenu, dans le flux : il ne recouvre rien, quelle que soit la
// page. Déduit de la route et du menu admin (utils/admin/adminBreadcrumb.ts) ;
// ne rend rien là où il n'apprendrait rien (tableau de bord, pages de premier
// niveau).

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import {
  ADMIN_NAV_HREFS,
  ADMIN_NAV_TRAILS,
} from '@/components/admin/navigation/adminNavTrail';
import { adminBreadcrumbFromTrails } from '@/utils/admin/adminBreadcrumb';
import nsAdminTopBar from '@/lib/i18n/locales/fr/adminTopBar';

/**
 * Le fil de la page courante. Partagé avec le bandeau de la coquille admin
 * (features/admin/_shared/shell/AdminShell.tsx), qui l'affiche en haut d'écran.
 */
export function useAdminCrumbs() {
  const router = useRouter();
  const t = useT(nsAdminTopBar);
  return adminBreadcrumbFromTrails(
    router.pathname,
    router.asPath,
    ADMIN_NAV_TRAILS,
    ADMIN_NAV_HREFS,
    {
      root: t.crumbRoot,
      entities: {
        tournament: t.crumbTournament,
        match: t.crumbMatch,
        stage: t.crumbStage,
        team: t.crumbTeam,
        user: t.crumbUser,
        tenant: t.crumbTenant,
        scrim: t.crumbScrim,
        planning: t.crumbPlanning,
        league: t.crumbLeague,
        event: t.crumbEvent,
        caster: t.crumbCaster,
      },
    }
  );
}

export default function AdminBreadcrumbs({
  className = '',
}: {
  className?: string;
}) {
  const t = useT(nsAdminTopBar);
  const crumbs = useAdminCrumbs();
  if (crumbs.length === 0) return null;

  return (
    // Visible sur mobile seulement : à partir de `md`, le bandeau de la
    // coquille admin porte le fil (Le Ruban).
    <nav
      aria-label={t.crumbAria}
      className={`mb-4 print:hidden md:hidden ${className}`}
    >
      <ol className="flex flex-wrap items-center gap-1 text-xs text-neutral-400">
        {crumbs.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-neutral-600">
                ›
              </span>
            )}
            {c.href ? (
              <Link
                href={c.href}
                className="rounded px-1 py-0.5 transition-colors hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                {c.label}
              </Link>
            ) : (
              <span className="px-1 py-0.5">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
