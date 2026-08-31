// lib/i18n/locales/admin-en/adminTeamsEditMemberModal.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamsEditMemberModal`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamsEditMemberModal.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Edit member',
  cancel: 'Cancel',
  saving: 'Saving...',
  save: 'Save',
  skillRatingLabel: 'Overwatch skill rating (SR)',
  skillRatingHint:
    'Between 0 and 5000. Leave empty to clear the declared rating.',
  roleLabel: 'Role',
  substitute: 'Substitute',
};
