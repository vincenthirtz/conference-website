// lib/i18n/locales/admin-en/adminTournamentMaps.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentMaps`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentMaps.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin · Map pool',
  eyebrow: 'Admin · Map pool',
  pageTitle: '{name} · Maps',
  defaultTournamentName: 'Tournament',
  slugTitle: 'Slug: {slug}',
  gameBadge: 'Game: {game}',
  linkMapDraw: 'Map draw',
  linkMatches: 'View matches',
  refresh: 'Refresh',
  loading: 'Loading…',
  cancelAddToggle: '✕ Cancel',
  addMapToggle: '+ Add a map',
  addingAll: 'Adding…',
  addAllMaps: '+ Add all {game} maps ({count})',
  deleteAllMapsScoped: 'Clear the "{pool}" pool',
  addMapTitle: 'Add a map',
  noVetoGame: '{game} does not use map veto.',
  noPredefinedPool: 'This game has no predefined map pool.',
  canAddCustom: 'You can still add a custom map.',
  mapGameToggle: '{game} map',
  mapCustomToggle: 'Custom map',
  selectMapLabel: 'Select a {game} map',
  chooseMapPlaceholder: '-- Choose a map --',
  mapNameLabel: 'Map name',
  mapNamePlaceholder: 'e.g. Custom Arena',
  mapTypeLabel: 'Map type',
  imageUrlLabel: 'Image URL (optional)',
  imageUrlPlaceholder: 'https://example.com/image.jpg',
  addButton: 'Add',
  cancel: 'Cancel',
  emptyMaps: 'No maps configured for this tournament.',
  editTitle: 'Edit',
  deleteTitle: 'Delete',
  enabled: 'Enabled',
  disabled: 'Disabled',
  orderLabel: 'Order: {order}',
  editMapTitle: 'Edit map',
  updating: 'Updating…',
  save: 'Save',
  imagePreviewLabel: 'Image preview',
  previewAlt: 'Preview',
  changeImageLabel: 'Change image',
  imageFormatHint: 'Accepted formats: JPG, PNG, WebP (max 5 MB)',
  orEnterUrlLabel: 'Or enter an image URL',
  typeControl: 'Control',
  typeHybrid: 'Hybrid',
  typeEscort: 'Escort',
  typePush: 'Push',
  typeFlashpoint: 'Flashpoint',
  typeClash: 'Clash',
  typeStandard: 'Standard',
  typeActiveDuty: 'Active Duty',
  errorLoad: 'Loading error',
  alertEnterMapName: 'Please enter a map name',
  alertSelectMap: 'Please select a map',
  errorAdd: 'Error while adding',
  confirmDeleteMap: 'Are you sure you want to delete this map?',
  errorDelete: 'Error while deleting',
  confirmDeleteAllScoped:
    'Delete every map in the "{pool}" pool? This action is irreversible. Other pools are left untouched.',
  errorUpdate: 'Error while updating',
  confirmAddAll: 'Add all missing {game} maps to the pool?',
  alertAllMapsPresent: 'All maps are already in the pool.',
  errorAddAll: 'Error during bulk add',

  // --- Per-round pool -----------------------------------------------------
  roundSelectorLegend: 'Pool to edit',
  roundDefaultPool: 'Tournament pool',
  roundDefaultPoolHint:
    'Default pool: it applies to any round that has none of its own.',
  roundMapsCount: '{count} maps',
  roundInheritsDefault: 'Falls back to the tournament pool',
  roundNoneScheduled:
    'No round scheduled yet: add matches to declare a per-round pool.',
  roundScopeNotice:
    'You are editing the pool for round {round}. Adding, editing and deleting only affect this round.',
  emptyRoundPool:
    'No map specific to round {round}: it will use the tournament pool.',
  mapRoundPoolToggle: 'Tournament map',
  selectMapFromDefaultLabel: 'Pick a map from the tournament pool',
  fillRoundFromDefault: '+ Copy the tournament pool ({count})',
  confirmFillRound:
    'Add every missing map from the tournament pool to round {round}?',
};
