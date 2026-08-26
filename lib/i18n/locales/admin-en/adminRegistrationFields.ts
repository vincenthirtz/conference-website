// lib/i18n/locales/admin-en/adminRegistrationFields.ts
//
// Traductions ANGLAISES du namespace admin `adminRegistrationFields`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminRegistrationFields.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  sectionTitle: 'Custom registration fields',
  sectionDescription:
    'These fields are added to the team registration form for this tournament. Each team fills them in when signing up.',
  emptyState:
    'No custom fields yet. Add one to collect extra information at registration.',
  addField: 'Add field',
  addRecommended: 'Add recommended fields',
  presetsHint: 'Suggested fields for {game}',
  presetsHintGeneric: 'Suggested fields for this game',
  fieldBadge: 'Field',
  labelLabel: 'Label',
  keyLabel: 'Key',
  keyHelp:
    "Stable identifier used to store answers. Don't change it once registrations are open.",
  typeLabel: 'Type',
  requiredLabel: 'Required field',
  helpLabel: 'Help text (optional)',
  helpPlaceholder: 'Shown under the field to guide the team',
  optionsLabel: 'Options',
  optionPlaceholder: 'Option label',
  addOption: 'Add option',
  removeOption: 'Remove option',
  maxLengthLabel: 'Max length (optional)',
  maxLengthPlaceholder: 'e.g. 200',
  typeText: 'Short text',
  typeTextarea: 'Long text',
  typeSelect: 'Dropdown',
  typeCheckbox: 'Checkbox',
  typeNumber: 'Number',
  typeUrl: 'Link (URL)',
  moveUp: 'Move up',
  moveDown: 'Move down',
  removeField: 'Remove field',
  errLabelRequired: 'Each field needs a label (1 to 80 characters).',
  errKeyInvalid: 'Invalid key: snake_case [a-z0-9_], 1 to 40 characters.',
  errKeyDuplicate: 'This key is already used by another field.',
  errSelectNeedsOption: 'A dropdown must have at least one option.',
  errFormInvalid: 'Fix the custom field errors before saving.',
  answersTitle: 'Registration form answers',
  answerYes: 'Yes',
  answerNo: 'No',
};
