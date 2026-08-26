// lib/i18n/locales/admin-fr/adminCustomGamePresets.ts
//
// Traductions FRANCAISES du namespace `adminCustomGamePresets` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminCustomGamePresets', {
  headTitle: 'Admin · Presets partie perso',
  eyebrow: 'Admin · Parties personnalisées',
  pageTitle: 'Presets de partie personnalisée',
  subtitle:
    "Code d'import que l'hôte colle dans le jeu. Aucun jeu n'expose d'API pour lancer un lobby : ce code est le seul raccourci automatisable, le site et le bot le poussent à l'hôte du match.",
  refresh: 'Rafraîchir',
  tablistLabel: 'Jeux',
  addButton: 'Nouveau preset',
  presetCount: '{count} preset(s)',
  loading: 'Chargement…',
  empty: 'Aucun preset pour ce jeu.',
  emptyHint:
    "Commence par un preset par défaut : il s'applique à tous les matchs de ce jeu, tournoi ou scrim.",
  howTo: 'Dans le jeu : Partie perso › Paramètres › Importer › coller le code.',
  scopeTenant: 'Défaut du tenant',
  scopeTournament: 'Tournoi',
  scopeStage: 'Phase',
  scopeHint:
    'Le preset le plus spécifique gagne : phase › tournoi › défaut du tenant.',
  scopeLocked:
    'Le périmètre n’est pas modifiable après création — supprime et recrée le preset pour le changer.',
  fieldName: 'Nom',
  fieldNamePlaceholder: 'Ex. : OWWC – Phase finale Bo5',
  fieldImportCode: "Code d'import",
  fieldImportCodePlaceholder: 'Ex. : A1B2C3',
  fieldImportCodeHint:
    'Overwatch : 4 à 12 caractères alphanumériques. Espaces et tirets sont retirés automatiquement.',
  fieldDescription: 'Description',
  fieldDescriptionPlaceholder: 'Règles maison, héros interdits, durée…',
  fieldMapPool: 'Cartes (rappel)',
  fieldMapPoolPlaceholder: 'Une carte par ligne',
  fieldMapPoolHint:
    'Purement indicatif pour l’hôte — le pool contraignant reste celui du tournoi.',
  fieldScope: 'Périmètre',
  fieldTournament: 'Tournoi',
  fieldStage: 'Phase',
  selectTournamentPlaceholder: '— Choisir un tournoi —',
  selectStageAll: 'Toutes les phases du tournoi',
  enabledLabel: 'Actif',
  disabledBadge: 'Désactivé',
  copyCode: 'Copier le code',
  copied: 'Code copié',
  edit: 'Modifier',
  delete: 'Supprimer',
  enable: 'Activer',
  disable: 'Désactiver',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  cancel: 'Annuler',
  modalTitleCreate: 'Nouveau preset',
  modalTitleEdit: 'Modifier le preset',
  confirmDeleteTitle: 'Supprimer ce preset ?',
  confirmDeleteSubtitle:
    'Les matchs concernés retomberont sur le preset de périmètre supérieur, ou sur aucun.',
  toastCreated: 'Preset créé',
  toastUpdated: 'Preset mis à jour',
  toastDeleted: 'Preset supprimé',
  toastEnabled: 'Preset activé',
  toastDisabled: 'Preset désactivé',
  errorLoad: 'Impossible de charger les presets',
  errorSave: "Impossible d'enregistrer le preset",
  errorDelete: 'Impossible de supprimer le preset',
  errorNameRequired: 'Renseigne un nom.',
  errorCodeRequired: "Renseigne un code d'import.",
  errorTournamentRequired: 'Choisis un tournoi pour ce périmètre.',
});
