// components/admin/broadcast/DiffusionTabsNav.tsx
//
// L'espace « Diffusion » : les overlays, les scènes, Twitch et les casteuses,
// réunis par une barre d'onglets commune à leurs écrans.
//
// POURQUOI UNE BARRE ET PAS UNE PAGE. Ces écrans servent la même soirée mais
// vivaient éparpillés : une entrée « Broadcast live » rangée dans Tournois,
// les scènes seulement en carte du tableau de bord, les casteuses dans
// l'Association, les overlays dans les outils d'un tournoi et dans le TCG.
// Les fondre en une page aurait remonté des milliers de lignes de temps réel
// (Realtime des scènes, pilotage OBS) dans un seul composant, et plusieurs
// écrans portent déjà leurs propres onglets `?tab=`. On garde les pages et
// leurs URL ; on leur donne un chapeau commun. Même choix que
// `TournamentTabsNav`.
//
// Le cockpit (`/admin/regie`) et le run-of-show (`/admin/events`) avaient ici
// leur onglet, ainsi qu'un point « en direct » allumé par un run en cours :
// retirés avec la fonctionnalité, qui n'a jamais servi en production.
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
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDiffusionNav from '@/lib/i18n/locales/admin-fr/adminDiffusionNav';

type Dict = typeof nsAdminDiffusionNav.fr;

export type DiffusionTabId =
  | 'overlays'
  | 'scenes'
  | 'live'
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

/**
 * Overlays EN PREMIER : c'est l'écran le plus ouvert de l'espace (toutes les
 * sources OBS, leurs réglages, leur présence à l'antenne). Viennent ensuite ce
 * qu'on pilote pendant le direct (scènes, Twitch), puis ce qu'on règle avant
 * (casteuses, chaînes suivies).
 */
export const DIFFUSION_TABS: readonly DiffusionTab[] = [
  {
    id: 'overlays',
    href: '/admin/diffusion/overlays',
    labelKey: 'tabOverlays',
    minRole: 'caster',
  },
  {
    id: 'scenes',
    href: '/admin/caster',
    labelKey: 'tabScenes',
    minRole: 'caster',
  },
  // « Twitch & interactions » : drops TCG, prédictions, points de chaîne,
  // commandes. L'URL date de l'ex-« console live ».
  {
    id: 'live',
    href: '/admin/broadcast/live',
    labelKey: 'tabLive',
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
  return (
    <nav
      aria-label={t.ariaLabel}
      className="mb-5 flex flex-wrap items-end gap-1 overflow-x-auto border-b border-[var(--line2,rgba(194,196,201,.2))]"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={selected ? 'page' : undefined}
            className={`-mb-px shrink-0 rounded-t-[var(--r-ctrl,4px)] px-4 py-2.5 font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.06em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)] ${
              selected
                ? 'border-b-2 border-[var(--or,#b467d1)] text-[var(--t1,#f4edf7)]'
                : 'border-b-2 border-transparent text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
            }`}
          >
            {t[tab.labelKey]}
          </Link>
        );
      })}
    </nav>
  );
}
