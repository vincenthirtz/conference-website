// lib/i18n/locales/admin-fr/adminTournamentMapDraw.ts
//
// Traductions FRANCAISES du namespace `adminTournamentMapDraw` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentMapDraw', {
  headTitle: 'Admin · Tirage de maps',
  eyebrow: 'Admin · Tirage de maps',
  defaultTournamentName: 'Tournoi',
  pageTitle: '{name} · Tirage de maps',
  linkVeto: 'Pick / Ban',
  linkMapPool: 'Pool de maps',
  linkMatches: 'Matchs',
  loading: 'Chargement…',
  emptyPool: 'Aucune map activée dans le pool.',
  configurePool: 'Configurer le pool de maps',
  formatLabel: 'Format :',
  formatSummary:
    '({choices} choix × {slots} matchs = {total} maps · {available} disponibles)',
  matchLabelLabel: 'Libellé du match :',
  matchLabelPlaceholder: 'Ex: Demi-finale — Équipe A vs Équipe B',
  randomDraw: 'Tirage aléatoire',
  reset: 'Réinitialiser',
  exportPdf: 'Exporter en PDF',
  selectedMapsTitle: 'Maps sélectionnées',
  choicesPerMatch: '({choices} choix par match)',
  mapSlot: 'Map {n}',
  choiceLabel: 'Choix {n}',
  choosePlaceholder: '— Choisir —',
  poolTitle: 'Pool de maps ({count})',
  selected: 'Sélectionnée',
  typeControl: 'Contrôle',
  typeHybrid: 'Hybride',
  typeEscort: 'Convoi',
  typePush: 'Push',
  typeFlashpoint: 'Flashpoint',
  errorLoad: 'Erreur de chargement',
  errorNotEnoughMaps:
    'Il faut au moins {total} maps activées dans le pool pour un {format} ({choices} choix × {slots} matchs).',
  pdfTitleDraw: '{name} — Tirage {format}',
  pdfTitleLabeled: '{name} — {label}',
  pdfFooter: '{name} · Tirage de maps',
  pdfMapSlot: 'MAP {n}',
});
