// components/admin/broadcast/DiffusionTabsNav.tsx
//
// L'espace « Diffusion » : la régie, les casteuses et les overlays, réunis par
// une barre d'onglets commune à leurs écrans.
//
// POURQUOI UNE BARRE ET PAS UNE PAGE. Ces écrans servent la même soirée mais
// vivaient à sept endroits : une entrée « Broadcast live » rangée dans
// Tournois, le cockpit et les scènes seulement en cartes du tableau de bord,
// le run-of-show joignable par un fil d'Ariane, les casteuses dans
// l'Association, les overlays dans les outils d'un tournoi et dans le TCG.
// Les fondre en une page aurait remonté des milliers de lignes de temps réel
// (cues, heartbeat, Realtime des scènes) dans un seul composant, et plusieurs
// écrans portent déjà leurs propres onglets `?tab=`. On garde les pages et
// leurs URL ; on leur donne un chapeau commun. Même choix que
// `TournamentTabsNav`.
//
// CHAQUE ONGLET PORTE SON DROIT. Un onglet qui mène à un 403 n'est pas un
// raccourci : il est masqué à qui n'a pas la permission de la page visée.
// Pendant la lecture de la session, tous les onglets s'affichent — la page
// courante a déjà passé son contrôle serveur, et une barre qui clignote vaut
// moins qu'un onglet de trop une fraction de seconde.
//
// Ce n'est pas le composant `Tabs` : navigation entre PAGES, donc de vrais
// `<Link>`, l'active portant `aria-current`.

import Link from 'next/link';
import { useStaffSession } from '@/hooks/useStaffSession';
import { canAccess, diffusionTabAccess } from '@/utils/admin/adminAccess';
import type { StaffRole } from '@/utils/staffRoles';
import { useDiffusionLive } from '@/hooks/useDiffusionLive';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDiffusionNav from '@/lib/i18n/locales/admin-fr/adminDiffusionNav';

type Dict = typeof nsAdminDiffusionNav.fr;

export type DiffusionTabId =
  | 'cockpit'
  | 'live'
  | 'runofshow'
  | 'scenes'
  | 'overlays'
  | 'casters'
  | 'twitch';

export type DiffusionTab = {
  id: DiffusionTabId;
  href: string;
  labelKey: {
    [K in keyof Dict]: K extends `tab${string}` ? K : never;
  }[keyof Dict];
  /** Permission exigée par la page. */
  permission?: string;
  /**
   * Rôle minimum exigé par la page quand elle se garde par rôle. Ni l'un ni
   * l'autre = tout le staff. `adminLinkGuards.test.ts` vérifie que la règle
   * n'est pas plus ouverte que la page.
   */
  minRole?: StaffRole;
};

/** L'ordre est celui d'une soirée : on conduit, on surveille, on habille. */
export const DIFFUSION_TABS: readonly DiffusionTab[] = [
  {
    id: 'cockpit',
    href: '/admin/regie',
    labelKey: 'tabCockpit',
    minRole: 'caster',
  },
  {
    id: 'live',
    href: '/admin/broadcast/live',
    labelKey: 'tabLive',
    minRole: 'caster',
  },
  // Le déroulé : on le prépare avant, on le conduit depuis le director.
  {
    id: 'runofshow',
    href: '/admin/events',
    labelKey: 'tabRunOfShow',
    permission: 'manage_broadcast',
  },
  {
    id: 'scenes',
    href: '/admin/caster',
    labelKey: 'tabScenes',
    minRole: 'caster',
  },
  {
    id: 'overlays',
    href: '/admin/diffusion/overlays',
    labelKey: 'tabOverlays',
    minRole: 'caster',
  },
  {
    id: 'casters',
    href: '/admin/diffusion/casteuses',
    labelKey: 'tabCasters',
    permission: 'manage_communications',
  },
  // Les chaînes que le site suit (pulse live, embeds) : réglées une fois,
  // relues avant chaque direct.
  {
    id: 'twitch',
    href: '/admin/twitch-channels',
    labelKey: 'tabTwitch',
    permission: 'manage_broadcast',
  },
];

/**
 * Les onglets qui suivent le RUN en direct : c'est sur eux que le point rouge
 * s'allume. Les autres (overlays, casteuses…) se règlent hors antenne.
 */
export const LIVE_TABS: ReadonlySet<DiffusionTabId> = new Set([
  'cockpit',
  'live',
]);

/**
 * Les onglets visibles pour ces permissions (`null` = pas encore lues) et ce
 * rôle (absent = inconnu : les onglets gardés par rôle restent affichés).
 */
export function visibleDiffusionTabs(
  permissions: readonly string[] | null,
  role?: StaffRole | null
): DiffusionTab[] {
  if (permissions === null) return [...DIFFUSION_TABS];
  return DIFFUSION_TABS.filter((tab) => {
    if (tab.permission) return permissions.includes(tab.permission);
    if (!role) return true;
    return canAccess(diffusionTabAccess(tab), role, permissions);
  });
}

export default function DiffusionTabsNav({
  active,
}: {
  active: DiffusionTabId;
}) {
  const t = useAdminT(nsAdminDiffusionNav);
  const { staffPermissions, staffRole, loading } = useStaffSession();
  const tabs = visibleDiffusionTabs(
    loading ? null : staffPermissions,
    staffRole
  );
  // Un run en direct se voit depuis N'IMPORTE quel écran de la diffusion :
  // on préparait les overlays sans savoir que l'antenne avait démarré.
  const live = useDiffusionLive();
  const onAir = live?.live === true;
  return (
    <nav
      aria-label={t.ariaLabel}
      className="mb-5 flex flex-wrap items-end gap-1 overflow-x-auto border-b border-neutral-700/60"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={selected ? 'page' : undefined}
            className={`-mb-px shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
              selected
                ? 'border-b-2 border-rose-500 text-white'
                : 'border-b-2 border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {t[tab.labelKey]}
            {onAir && LIVE_TABS.has(tab.id) && (
              <>
                <span
                  aria-hidden
                  title={live?.runName ?? undefined}
                  className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 align-middle"
                />
                <span className="sr-only">
                  {` — ${t.liveNow}${live?.runName ? ` : ${live.runName}` : ''}`}
                </span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
