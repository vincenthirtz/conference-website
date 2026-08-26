// lib/i18n/locales/admin-en/adminCastMemberStaffPicker.ts
//
// Traductions ANGLAISES du namespace admin `adminCastMemberStaffPicker`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminCastMemberStaffPicker.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  loadError: 'Loading error.',
  label: 'Linked caster staff account',
  none: '— None (public profile only) —',
  loading: 'Loading casters…',
  errorPrefix: 'Error: {error}',
  hint: 'Only staff accounts with the "caster" role can be linked. A caster can be attached to only one profile.',
};
