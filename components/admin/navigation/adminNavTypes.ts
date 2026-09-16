// components/admin/navigation/adminNavTypes.ts
//
// Les TYPES de l'arbre de navigation admin, extraits de `adminNav.ts` —
// lot A7 : tout lot qui touche un god-component en sort un morceau. Le lot TCG
// y ajoutait une entrée de menu, et le garde-fou de taille l'a refusé, comme il
// avait refusé le lot Drive avant lui (c'est ce qui avait donné
// `adminNavCards.ts`).
//
// Des types n'ont pas besoin de voisiner avec les 800 lignes de données qui les
// habitent. `adminNav.ts` les ré-exporte, de sorte qu'aucun appelant n'a à
// savoir que la découpe a eu lieu.

import type { StaffRole } from '@/utils/staff';
import type { StaffPermission } from '@/utils/staffPermissions';

/** Clés d'icônes SVG. Le rendu JSX vit dans `pages/admin/index.tsx` (map ICON). */
export type AdminNavIcon =
  | 'trophy'
  | 'users'
  | 'inbox'
  | 'ticket'
  | 'shield'
  | 'mail'
  | 'clock'
  | 'cog'
  | 'signal'
  | 'chart'
  | 'medal'
  | 'bolt'
  | 'beaker'
  | 'map'
  | 'key'
  | 'trash'
  | 'help';

/** Métadonnées propres à la carte dashboard (absentes du top-bar). */
export type AdminNavCardMeta = {
  /** Position dans la grille de cartes (ordre stable, indépendant de l'arbre). */
  order: number;
  /** Clé i18n du titre dans le dictionnaire `adminDashboard`. */
  titleKey: string;
  /** Clé i18n de la description dans le dictionnaire `adminDashboard`. */
  descKey: string;
  icon: AdminNavIcon;
  /** Classes Tailwind d'accent (bordure + dégradé + texte). */
  accent: string;
};

export type AdminNavNode = {
  /** Identifiant stable (debug / clés React). */
  id: string;
  /** Libellé FR figé du top-bar. Absent => item non exposé dans le top-bar. */
  topBarLabel?: string;
  /** Route. Vide/absent pour un conteneur (section/sous-section) pur. */
  href?: string;
  /** Rôle minimum requis. Partagé par les deux surfaces (gating identique). */
  minRole?: StaffRole;
  /**
   * Permission exigée par la PAGE cible (lot A2). Quand elle est présente, elle
   * l'emporte sur `minRole` : c'est elle que la page applique côté serveur, et
   * un menu qui filtrerait autrement afficherait des entrées menant à un 403.
   *
   * Absente = gating historique par rôle, inchangé.
   */
  permission?: StaffPermission;
  /** Métadonnées de carte dashboard. Absent => pas de carte. */
  card?: AdminNavCardMeta;
  /**
   * Marque un nœud comme faisant partie de la « console développeur » (tenant
   * `kind='developer'`) : facturation, clés API, webhooks, hub dev, docs.
   * Un tenant développeur ne voit QUE les nœuds `devConsole:true` (le reste de
   * la nav admin est masqué). Absent/false pour tout le reste (cas organizer).
   */
  devConsole?: boolean;
  children?: AdminNavNode[];
};
