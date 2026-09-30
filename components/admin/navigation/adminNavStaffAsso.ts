// components/admin/navigation/adminNavStaffAsso.ts — la section « Staff &
// Asso » de l'arbre de navigation admin, sortie de `adminNav.ts` (garde de
// taille des god-components : le lot qui y ajoutait « Planning du staff » en
// sort un morceau, comme `adminNavCards.ts` avant lui). `ADMIN_NAV` l'insère
// à sa place : ordre, rôles et cartes inchangés.

import type { AdminNavNode } from './adminNavTypes';

export const STAFF_ASSO_NAV: AdminNavNode = {
  // Section « Staff & Asso » : REGROUPEMENT de navigation des écrans
  // « People/Staff » auparavant dispersés entre Contenu (Casteuses, Pôles) et
  // Configuration (Utilisateurs, Adhérents). Les trois ex-listes Casteuses,
  // Pôles de l'asso et Adhérents ont été FUSIONNÉES dans le hub à onglets
  // /admin/association?tab=poles|adherents — les Casteuses l'ont quitté pour
  // Diffusion › Casteuses (lot 8, `?tab=cast` y redirige). Comme pour les fusions
  // Modération / Communication / Partenaires, une SEULE entrée top-bar
  // « Association » pointe vers le hub ; les onglets se découvrent sur la page.
  // Les trois domaines sont admin-gated, d'où un host admin homogène (pas de
  // re-gate par onglet). Les éditeurs (adherents/new, cast/pole new + [id])
  // restent des routes à part : l'entrée « Ajouter un adhérent » est conservée.
  // La carte dashboard « Gérer les utilisateurs » (order 9) suit son nœud.
  id: 'staff-asso',
  topBarLabel: 'Staff & Asso',
  href: '',
  minRole: 'admin',
  children: [
    {
      id: 'users-manage',
      topBarLabel: 'Gérer les utilisateurs',
      href: '/admin/users/manage',
      permission: 'manage_staff',
      minRole: 'admin',
      card: {
        order: 9,
        titleKey: 'navUsersTitle',
        descKey: 'navUsersDesc',
        icon: 'users',
        accent: 'border-emerald-500/30 from-emerald-500/10 text-emerald-300',
      },
    },
    {
      id: 'users-new',
      topBarLabel: 'Créer un utilisateur',
      href: '/admin/users/new',
      permission: 'manage_staff',
      minRole: 'admin',
    },
    {
      // Consultable par TOUT le staff (chacun regarde qui est là quel soir) ;
      // l'écriture est gardée côté API par `manage_staff`.
      id: 'staff-planning',
      topBarLabel: 'Planning du staff',
      href: '/admin/staff-planning',
      minRole: 'helper',
    },
    {
      id: 'association',
      topBarLabel: 'Association',
      href: '/admin/association',
      permission: 'manage_communications',
      minRole: 'admin',
    },
    {
      // Le Drive de l'asso (statuts, PV, rapports, factures). Droit dédié :
      // ni le caster, ni l'arbitre, ni le bénévole — un PV nomme des
      // personnes physiques. Cf. docs/ETUDE-drive-et-chat.md.
      id: 'documents',
      topBarLabel: 'Documents de l’asso',
      href: '/admin/documents',
      // LECTURE : la page s'ouvre à qui peut consulter. Le dépôt et la
      // corbeille demandent `manage_documents`, vérifié dans la page et
      // re-vérifié par la route.
      permission: 'read_documents',
      minRole: 'admin',
    },
    {
      id: 'adherents-new',
      topBarLabel: 'Ajouter un adhérent',
      href: '/admin/adherents/new',
      permission: 'manage_communications',
      minRole: 'admin',
    },
  ],
};
