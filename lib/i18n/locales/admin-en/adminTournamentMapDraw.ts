// lib/i18n/locales/admin-en/adminTournamentMapDraw.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentMapDraw`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentMapDraw.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin · Map draw',
  eyebrow: 'Admin · Map draw',
  defaultTournamentName: 'Tournament',
  pageTitle: '{name} · Map draw',
  linkVeto: 'Pick / Ban',
  linkMapPool: 'Map pool',
  linkMatches: 'Matches',
  loading: 'Loading…',
  emptyPool: 'No maps enabled in the pool.',
  configurePool: 'Configure the map pool',
  formatLabel: 'Format:',
  formatSummary:
    '({choices} choices × {slots} matches = {total} maps · {available} available)',
  matchLabelLabel: 'Match label:',
  matchLabelPlaceholder: 'e.g. Semifinal — Team A vs Team B',
  randomDraw: 'Random draw',
  reset: 'Reset',
  exportPdf: 'Export to PDF',
  selectedMapsTitle: 'Selected maps',
  choicesPerMatch: '({choices} choices per match)',
  mapSlot: 'Map {n}',
  choiceLabel: 'Choice {n}',
  choosePlaceholder: '— Choose —',
  poolTitle: 'Map pool ({count})',
  selected: 'Selected',
  typeControl: 'Control',
  typeHybrid: 'Hybrid',
  typeEscort: 'Escort',
  typePush: 'Push',
  typeFlashpoint: 'Flashpoint',
  errorLoad: 'Loading error',
  errorNotEnoughMaps:
    'You need at least {total} maps enabled in the pool for a {format} ({choices} choices × {slots} matches).',
  pdfTitleDraw: '{name} — {format} draw',
  pdfTitleLabeled: '{name} — {label}',
  pdfFooter: '{name} · Map draw',
  pdfMapSlot: 'MAP {n}',
};
