import type { AdminLink } from '@/types/components';
import { hasAtLeastRole, type StaffRole } from '@/utils/staff';
import { buildAdminLinks } from '@/components/admin/navigation/adminNav';

/**
 * Arbre du menu top-bar, dérivé de la source unique `ADMIN_NAV`
 * (`components/admin/navigation/adminNav.ts`). Toute création/suppression de
 * page se fait désormais dans ce seul module partagé, consommé à la fois par
 * le top-bar (ici) et les cartes du dashboard (`pages/admin/index.tsx`).
 */
export const ADMIN_LINKS: AdminLink[] = buildAdminLinks();

export function filterAdminLinks(
  staffRole: StaffRole | null,
  links: AdminLink[] = ADMIN_LINKS
): AdminLink[] {
  const canAccess = (minRole?: StaffRole) =>
    hasAtLeastRole(staffRole, minRole ?? 'admin');

  return links
    .map((item): AdminLink | null => {
      const itemMinRole = item.minRole ?? 'admin';
      const children: AdminLink[] =
        item.children
          ?.map((child) => ({
            ...child,
            minRole: child.minRole ?? itemMinRole,
          }))
          .filter((child) => canAccess(child.minRole)) ?? [];

      const selfAccessible = !!item.ref && canAccess(itemMinRole);
      if (!selfAccessible && children.length === 0) return null;

      return { ...item, children };
    })
    .filter((item): item is AdminLink => item !== null);
}
