// lib/i18n/locales/admin-en/adminTeamsImportBattleTagsModal.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamsImportBattleTagsModal`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamsImportBattleTagsModal.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Import BattleTags',
  subtitlePrefix: 'One line per member:',
  subtitleSuffix:
    'The identifier can be a current BattleTag, a User ID or a member ID.',
  toApply: '{count} to apply',
  cancel: 'Cancel',
  apply: 'Apply BattleTags',
  textareaPlaceholder: 'Old#1234,New#5678\nmember-uuid,Name#0001',
  preview: 'Preview',
  colIdentifiant: 'Identifier',
  colStatut: 'Status',
  emptyLine: 'No line',
  statusMatched: 'Found',
  statusInvalid: 'Invalid format',
  statusNotFound: 'Not found',
  statusEmpty: 'Incomplete line',
};
