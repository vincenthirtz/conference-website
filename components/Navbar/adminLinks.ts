import type { AdminLink } from '@/types/components';
import { hasAtLeastRole, type StaffRole } from '@/utils/staff';
import { buildAdminLinks } from '@/components/admin/navigation/adminNav';
import type { TenantKind } from '@/utils/tenantKind';

/**
 * Arbre du menu top-bar, dérivé de la source unique `ADMIN_NAV`
 * (`components/admin/navigation/adminNav.ts`). Toute création/suppression de
 * page se fait désormais dans ce seul module partagé, consommé à la fois par
 * le top-bar (ici) et les cartes du dashboard (`pages/admin/index.tsx`).
 */
export const ADMIN_LINKS: AdminLink[] = buildAdminLinks();

export function filterAdminLinks(
  staffRole: StaffRole | null,
  links: AdminLink[] = ADMIN_LINKS,
  tenantKind?: TenantKind
): AdminLink[] {
  const canAccess = (minRole?: StaffRole) =>
    hasAtLeastRole(staffRole, minRole ?? 'admin');

  // Console développeur : un tenant `kind='developer'` ne voit QUE les nœuds
  // marqués `devConsole`. Ce filtre s'applique EN PLUS du filtre par rôle (les
  // deux doivent passer). Pour un tenant organizer (ou tenantKind absent), le
  // comportement est inchangé (toute la nav, gating rôle seul).
  const devMode = tenantKind === 'developer';

  // Filtrage RÉCURSIF (profondeur arbitraire) : depuis le regroupement
  // « Compétition », l'arbre a 3 niveaux (section → sous-section → item). Un
  // nœud sans `minRole` hérite du rôle effectif de son parent ; un conteneur
  // est conservé s'il est lui-même accessible (self-ref) OU s'il reste au moins
  // un descendant accessible. En mode développeur, une feuille n'est conservée
  // que si elle est `devConsole` ; un conteneur reste conservé s'il a un
  // descendant `devConsole` conservé.
  const filterLevel = (
    items: AdminLink[],
    inheritedMinRole: StaffRole
  ): AdminLink[] =>
    items
      .map((item): AdminLink | null => {
        const itemMinRole = item.minRole ?? inheritedMinRole;
        const children = item.children
          ? filterLevel(item.children, itemMinRole)
          : [];
        const devOk = !devMode || item.devConsole === true;
        const selfAccessible = !!item.ref && canAccess(itemMinRole) && devOk;
        if (!selfAccessible && children.length === 0) return null;
        return { ...item, minRole: itemMinRole, children };
      })
      .filter((item): item is AdminLink => item !== null);

  return filterLevel(links, 'admin');
}
