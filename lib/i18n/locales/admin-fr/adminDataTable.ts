// lib/i18n/locales/admin-fr/adminDataTable.ts
//
// Vocabulaire du KIT de listes (`components/admin/DataTable`) — lot A5.
//
// Ces huit libellés décrivent la table elle-même (recherche, export, pages,
// sélection), pas le métier de l'écran. Les faire porter par chaque écran
// obligeait à recopier huit clés par migration : c'est précisément la
// duplication que le kit existe pour supprimer.

import { adminNs } from '../../ns';

export default adminNs('adminDataTable', {
  search: 'Filtrer la liste',
  searchPlaceholder: 'Filtrer…',
  empty: 'Aucun résultat.',
  export: 'Exporter en CSV',
  selected: '{n} sélectionné(s)',
  selectAll: 'Tout sélectionner',
  selectRow: 'Sélectionner la ligne',
  previous: 'Précédent',
  next: 'Suivant',
  page: 'Page {page} / {pages}',
});
