// lib/i18n/locales/admin-fr/adminDisputes.ts
//
// Traductions FRANCAISES du namespace `adminDisputes` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDisputes', {
  pageTitle: 'Admin – Disputes ouvertes',
  heading: 'Disputes ouvertes',
  introPrefix: 'Board cross-tournoi avec SLA. Une dispute en',
  introSuffix:
    'a dépassé la fenêtre SLA et a déclenché une escalation Discord (ou est sur le point de le faire). Triées par âge décroissant par défaut.',
  refresh: 'Rafraîchir',
  statTotal: 'Total',
  statBreached: 'Breached',
  statApproaching: 'Approaching',
  statFresh: 'Fresh',
  tournamentLabel: 'Tournoi :',
  tournamentAll: '— Tous —',
  resultsCount: '{count} résultat(s)',
  shownCount: '{count} affichée(s)',
  autoRefresh: '· auto-refresh 60s',
  errorLoad: 'Erreur de chargement',
  loading: 'Chargement…',
  empty: "Aucune dispute {filter} pour l'instant. ✨",
  prev: '← Précédent',
  next: 'Suivant →',
  paginationRange: '{from} – {to}',
  paginationOf: ' sur {total}',
  slaLine: '/ SLA {min} min',
  escalated: '· escaladé ✉️',
  vs: 'vs',
  resolve: 'Résoudre →',
});
