// lib/i18n/locales/admin-fr/adminDiscordLogs.ts
//
// Traductions FRANCAISES du namespace `adminDiscordLogs` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDiscordLogs', {
  heading: 'Journal Discord',
  subtitlePlayer: 'Actions passées par les joueuses depuis Discord.',
  subtitleEvent: 'Événements poussés par le site vers le bot Discord.',
  countActions_one: '{count} action',
  countActions_other: '{count} actions',
  loading: 'Chargement…',

  sourceLabel: 'Source',
  sourcePlayer: 'Actions joueuses',
  sourceEvent: 'Événements sortants',
  sourceAriaLabel: 'Source du journal Discord',

  labelAction: 'Action',
  allActions: 'Toutes les actions',
  labelEvent: 'Événement',
  allEvents: 'Tous les événements',
  labelStatus: 'Statut de livraison',
  allStatuses: 'Tous les statuts',
  statusPending: 'En attente',
  statusDelivered: 'Livré',
  statusFailed: 'Échec',
  labelEntityType: 'Type d’entité',
  placeholderEntityType: 'team, match, invitation…',
  labelActor: 'Discord ID de l’autrice',
  labelTarget: 'Discord ID de la cible',
  placeholderDiscordId: '123456789012345678',
  labelSearch: 'Recherche',
  placeholderSearch: 'Action, pseudo, payload…',
  labelFrom: 'Du',
  labelTo: 'Au',
  filter: 'Filtrer',

  exportCsv: 'Exporter CSV',
  exporting: 'Export…',
  exportError: 'L’export CSV a échoué.',
  sortedByDate: 'Trié par date décroissante',

  by: 'par',
  targetPrefix: 'cible',
  attempts: '{count} tentative(s)',
  deliveredAt: 'Livré le {date}',
  detailsPayload: 'Voir le payload',
  empty: 'Aucune action Discord ne correspond à ces filtres.',

  previous: 'Précédent',
  next: 'Suivant',
  paginationTotal: ' sur {total}',
});
