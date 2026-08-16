// lib/i18n/locales/admin-fr/adminRegistrationFields.ts
//
// Traductions FRANCAISES du namespace `adminRegistrationFields` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminRegistrationFields', {
  sectionTitle: "Champs d'inscription personnalisés",
  sectionDescription:
    "Ces champs s'ajoutent au formulaire d'inscription des équipes à ce tournoi. Chaque équipe devra les renseigner lors de son inscription.",
  emptyState:
    "Aucun champ personnalisé. Ajoute un champ pour collecter des informations supplémentaires à l'inscription.",
  addField: 'Ajouter un champ',
  addRecommended: 'Ajouter les champs recommandés',
  presetsHint: 'Champs suggérés pour {game}',
  presetsHintGeneric: 'Champs suggérés pour ce jeu',
  fieldBadge: 'Champ',
  labelLabel: 'Libellé',
  keyLabel: 'Clé',
  keyHelp:
    'Identifiant stable utilisé pour stocker les réponses. Ne le change pas une fois les inscriptions ouvertes.',
  typeLabel: 'Type',
  requiredLabel: 'Champ obligatoire',
  helpLabel: "Texte d'aide (optionnel)",
  helpPlaceholder: "Affiché sous le champ pour guider l'équipe",
  optionsLabel: 'Options',
  optionPlaceholder: "Intitulé de l'option",
  addOption: 'Ajouter une option',
  removeOption: "Supprimer l'option",
  maxLengthLabel: 'Longueur max. (optionnel)',
  maxLengthPlaceholder: 'ex. 200',
  typeText: 'Texte court',
  typeTextarea: 'Texte long',
  typeSelect: 'Liste déroulante',
  typeCheckbox: 'Case à cocher',
  typeNumber: 'Nombre',
  typeUrl: 'Lien (URL)',
  moveUp: 'Monter',
  moveDown: 'Descendre',
  removeField: 'Supprimer le champ',
  errLabelRequired: 'Chaque champ doit avoir un libellé (1 à 80 caractères).',
  errKeyInvalid: 'Clé invalide : snake_case [a-z0-9_], 1 à 40 caractères.',
  errKeyDuplicate: 'Cette clé est déjà utilisée par un autre champ.',
  errSelectNeedsOption: 'Une liste déroulante doit avoir au moins une option.',
  errFormInvalid:
    "Corrige les erreurs des champs personnalisés avant d'enregistrer.",
  answersTitle: "Réponses au formulaire d'inscription",
  answerYes: 'Oui',
  answerNo: 'Non',
});
