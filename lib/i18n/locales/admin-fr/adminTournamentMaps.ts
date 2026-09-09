// lib/i18n/locales/admin-fr/adminTournamentMaps.ts
//
// Traductions FRANCAISES du namespace `adminTournamentMaps` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentMaps', {
  headTitle: 'Admin · Pool de maps',
  eyebrow: 'Admin · Pool de maps',
  pageTitle: '{name} · Maps',
  defaultTournamentName: 'Tournoi',
  slugTitle: 'Slug: {slug}',
  gameBadge: 'Jeu : {game}',
  linkMapDraw: 'Tirage de maps',
  linkMatches: 'Voir les matchs',
  refresh: 'Rafraîchir',
  loading: 'Chargement…',
  cancelAddToggle: '✕ Annuler',
  addMapToggle: '+ Ajouter une map',
  addingAll: 'Ajout en cours…',
  addAllMaps: '+ Ajouter toutes les maps {game} ({count})',
  deleteAllMapsScoped: 'Vider le pool « {pool} »',
  addMapTitle: 'Ajouter une map',
  noVetoGame: "{game} n'utilise pas de veto de maps.",
  noPredefinedPool: 'Ce jeu ne dispose pas de pool de maps prédéfini.',
  canAddCustom: 'Vous pouvez tout de même ajouter une map personnalisée.',
  mapGameToggle: 'Map {game}',
  mapCustomToggle: 'Map personnalisée',
  selectMapLabel: 'Sélectionner une map {game}',
  chooseMapPlaceholder: '-- Choisir une map --',
  mapNameLabel: 'Nom de la map',
  mapNamePlaceholder: 'Ex: Custom Arena',
  mapTypeLabel: 'Type de map',
  imageUrlLabel: "URL de l'image (optionnel)",
  imageUrlPlaceholder: 'https://exemple.com/image.jpg',
  addButton: 'Ajouter',
  cancel: 'Annuler',
  emptyMaps: 'Aucune map configurée pour ce tournoi.',
  editTitle: 'Éditer',
  deleteTitle: 'Supprimer',
  enabled: 'Activée',
  disabled: 'Désactivée',
  orderLabel: 'Ordre : {order}',
  editMapTitle: 'Éditer la map',
  updating: 'Mise à jour…',
  save: 'Enregistrer',
  imagePreviewLabel: "Aperçu de l'image",
  previewAlt: 'Aperçu',
  changeImageLabel: "Changer l'image",
  imageFormatHint: 'Format accepté : JPG, PNG, WebP (max 5 MB)',
  orEnterUrlLabel: "Ou entrer une URL d'image",
  typeControl: 'Contrôle',
  typeHybrid: 'Hybride',
  typeEscort: 'Convoi',
  typePush: 'Push',
  typeFlashpoint: 'Flashpoint',
  typeClash: 'Clash',
  typeStandard: 'Standard',
  typeActiveDuty: 'Active Duty',
  errorLoad: 'Erreur de chargement',
  alertEnterMapName: 'Veuillez entrer un nom de map',
  alertSelectMap: 'Veuillez sélectionner une map',
  errorAdd: "Erreur lors de l'ajout",
  confirmDeleteMap: 'Êtes-vous sûr de vouloir supprimer cette map ?',
  errorDelete: 'Erreur lors de la suppression',
  confirmDeleteAllScoped:
    'Supprimer toutes les maps du pool « {pool} » ? Cette action est irréversible. Les autres pools ne sont pas touchés.',
  errorUpdate: 'Erreur lors de la mise à jour',
  confirmAddAll: 'Ajouter toutes les maps {game} manquantes au pool ?',
  alertAllMapsPresent: 'Toutes les maps sont déjà dans le pool.',
  errorAddAll: "Erreur lors de l'ajout groupé",

  // --- Pool par journée ---------------------------------------------------
  roundSelectorLegend: 'Pool à éditer',
  roundDefaultPool: 'Pool du tournoi',
  roundDefaultPoolHint:
    "Pool par défaut : il s'applique à toute journée qui n'a pas le sien.",
  roundMapsCount: '{count} maps',
  roundInheritsDefault: 'Reprend le pool du tournoi',
  roundNoneScheduled:
    "Aucune journée au planning : ajoutez des matchs pour déclarer un pool par journée.",
  roundScopeNotice:
    'Vous éditez le pool de la journée {round}. Ajouts, modifications et suppressions ne concernent que cette journée.',
  emptyRoundPool:
    "Aucune map propre à la journée {round} : elle utilisera le pool du tournoi.",
  mapRoundPoolToggle: 'Map du tournoi',
  selectMapFromDefaultLabel: 'Sélectionner une map du pool du tournoi',
  fillRoundFromDefault: '+ Reprendre le pool du tournoi ({count})',
  confirmFillRound:
    'Ajouter à la journée {round} toutes les maps manquantes du pool du tournoi ?',
});
