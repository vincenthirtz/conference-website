// lib/i18n/locales/admin-fr/adminTenantsList.ts
//
// Traductions FRANCAISES du namespace `adminTenantsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTenantsList', {
  errorLoad: 'Erreur de chargement',
  pageTitle: 'Admin – Tenants',
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Tenants',
  heading: 'Tenants',
  loading: 'Chargement…',
  countTenants_one: '{count} tenant configuré',
  countTenants_other: '{count} tenants configurés',
  createTenant: 'Créer un tenant',
  pendingText_one: " serveur Discord en attente d'attribution.",
  pendingText_other: " serveurs Discord en attente d'attribution.",
  pendingViewQueue: 'Voir la file →',
  searchPlaceholder: 'Rechercher par slug ou nom…',
  filterAll: 'Tous',
  filterActive: 'Actifs',
  filterArchived: 'Archivés',
  emptyTitle: 'Aucun tenant trouvé',
  emptyDescNone: 'Aucun tenant configuré pour le moment.',
  emptyDescFilter: 'Aucun résultat pour ce filtre / cette recherche.',
  colSlug: 'Slug',
  colName: 'Nom',
  colStatus: 'Statut',
  colPlan: 'Plan',
  colGuilds: 'Guilds',
  colStaff: 'Staff',
  colCreated: 'Créé le',
  colActions: 'Actions',
  statusActive: 'Actif',
  statusArchived: 'Archivé',
  planStatusActive: 'Actif',
  planStatusPastDue: 'En retard',
  planStatusCanceled: 'Annulé',
  planExpires: 'Expire le {date}',
  generateLink: 'Lien de paiement',
  generateLinkOwnerOnly: 'Réservé au rôle Owner',
  edit: 'Éditer',
  loadingTenants: 'Chargement des tenants…',
  usageLink: "Consommation d'API",
});
