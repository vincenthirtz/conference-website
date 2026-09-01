// components/admin/navigation/adminNavCards.ts
//
// Projection « cartes du dashboard » de l'arbre `ADMIN_NAV`, extraite de
// `adminNav.ts` — lot A7 : tout lot qui touche un god-component en sort un
// morceau. Le lot Drive y ajoutait une entrée de menu, et le garde-fou de
// taille l'a refusé.
//
// L'arbre reste la source unique de vérité ; ce module ne fait que le lire.
// Les symboles publics sont ré-exportés par `adminNav.ts`, de sorte que les
// appelants n'ont pas à savoir que la découpe a eu lieu.

import { hasAtLeastRole } from '@/utils/staff';
import type { StaffRole } from '@/utils/staff';
import {
  roleHasStaffPermission,
  type StaffPermission,
} from '@/utils/staffPermissions';
import type { TenantKind } from '@/utils/tenantKind';
import {
  ADMIN_NAV,
  type AdminNavCardMeta,
  type AdminNavNode,
} from './adminNav';

/** Carte dashboard résolue depuis l'arbre (métadonnées + href/rôle du nœud). */
export type AdminNavCard = {
  id: string;
  href: string;
  minRole: StaffRole;
  /** Permission de la page cible, si elle en déclare une (lot A2). */
  permission?: StaffPermission;
  card: AdminNavCardMeta;
  /** Copié du nœud : la carte fait partie de la « console développeur ». */
  devConsole?: boolean;
};

/** Convertit un nœud en carte dashboard, ou `null` s'il n'en porte pas. */
function toAdminNavCard(node: AdminNavNode): AdminNavCard | null {
  if (!node.card || !node.href) return null;
  return {
    id: node.id,
    href: node.href,
    minRole: node.minRole ?? 'admin',
    permission: node.permission,
    card: node.card,
    devConsole: node.devConsole,
  };
}

/**
 * Walker partagé : parcourt récursivement `list`, convertit chaque nœud
 * porteur de `card` et laisse `visit` décider de le conserver (filtrage rôle /
 * console dev côté appelant). Source unique pour `collectAdminNavCards` et
 * `collectAdminNavCardGroups` afin qu'ils ne dérivent pas.
 */
function walkAdminNavCards(
  list: AdminNavNode[],
  visit: (card: AdminNavCard) => void
): void {
  for (const node of list) {
    const card = toAdminNavCard(node);
    if (card) visit(card);
    if (node.children) walkAdminNavCards(node.children, visit);
  }
}

/**
 * Collecte tous les nœuds porteurs de métadonnées `card`, quel que soit leur
 * niveau dans l'arbre, triés par `card.order` pour reproduire l'ordre
 * historique de la grille du dashboard. (Filtrage rôle / console dev laissé à
 * l'appelant, cf. `collectAdminNavCardGroups` qui l'intègre.)
 */
export function collectAdminNavCards(
  nodes: AdminNavNode[] = ADMIN_NAV
): AdminNavCard[] {
  const out: AdminNavCard[] = [];
  walkAdminNavCards(nodes, (card) => out.push(card));
  return out.sort((a, b) => a.card.order - b.card.order);
}

/** Groupe de cartes dashboard rattaché à une catégorie top-level. */
export type AdminNavCardGroup = {
  /** Id du conteneur top-level (ex. `competition`). */
  categoryId: string;
  /** Clé i18n du libellé de catégorie dans le dictionnaire `adminDashboard`. */
  labelKey: string;
  /** Cartes visibles de la catégorie, triées par `card.order`. */
  cards: AdminNavCard[];
};

/**
 * Clés i18n (dictionnaire `adminDashboard`) des libellés de catégorie du
 * dashboard, indexées par l'id du conteneur top-level de `ADMIN_NAV`. Un
 * top-level non listé (ex. `dashboard`) ne produit pas de groupe.
 */
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  competition: 'catCompetition',
  contenu: 'catContenu',
  communication: 'catCommunication',
  'staff-asso': 'catStaffAsso',
  configuration: 'catConfiguration',
};

/**
 * Comme `collectAdminNavCards`, mais regroupe les cartes par catégorie
 * top-level (ordre de `ADMIN_NAV`) et applique le même filtrage que le
 * dashboard :
 *   - gating par rôle (`hasAtLeastRole(role, card.minRole)`) ;
 *   - console développeur : si `tenantKind === 'developer'`, ne garder que les
 *     cartes `devConsole`.
 * Chaque groupe est trié par `card.order` ; les catégories sans carte visible
 * sont omises. Le walker est partagé avec `collectAdminNavCards`.
 */
export function collectAdminNavCardGroups(
  role: StaffRole,
  opts?: { tenantKind?: TenantKind }
): AdminNavCardGroup[] {
  const developer = opts?.tenantKind === 'developer';
  const groups: AdminNavCardGroup[] = [];

  for (const top of ADMIN_NAV) {
    const labelKey = CATEGORY_LABEL_KEYS[top.id];
    if (!labelKey) continue;

    const cards: AdminNavCard[] = [];
    walkAdminNavCards([top], (card) => {
      // La permission prime : c'est ce que la page applique réellement.
      if (card.permission) {
        if (!roleHasStaffPermission(role, card.permission)) return;
      } else if (!hasAtLeastRole(role, card.minRole)) return;
      if (developer && card.devConsole !== true) return;
      cards.push(card);
    });
    if (cards.length === 0) continue;

    cards.sort((a, b) => a.card.order - b.card.order);
    groups.push({ categoryId: top.id, labelKey, cards });
  }

  return groups;
}
