// lib/i18n/locales/en/cockpitChecklist.ts
//
// Traductions ANGLAISES du namespace `cockpitChecklist`.
//
// La SOURCE DE VERITE est le francais (`../fr/cockpitChecklist.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  sessionExpired: 'Session expired, sign in again.',
  updateFailed: 'Update failed.',
  updateChecklistFailed: 'Unable to update the checklist.',
  title: 'Pre-match checklist',
  emptyBody:
    'No checklist item for this segment. Ask the Director to configure the list from the admin if needed.',
  validatedProgress: '{checked} / {total} checked',
  validated: 'Checked',
  validatedAtSuffix: ' at {time}',
};
