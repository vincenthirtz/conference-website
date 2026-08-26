// lib/i18n/locales/en/teamRhythm.ts
//
// Traductions ANGLAISES du namespace `teamRhythm`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamRhythm.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Team rhythm',
  subtitle:
    'Paint the slots you usually play. The team sees when it is at full strength — and can turn that into a scrim listing.',
  declaredCount: '{declared} of {total} have declared',
  cellAvailable: '{count} available',
  saveCta: 'Save my slots',
  saving: 'Saving…',
  saved: 'Your slots have been saved.',
  saveError: 'Could not save your slots.',
  coreTitle: 'Slots with {threshold} players or more',
  coreEmpty: 'No slot gathers the required line-up yet.',
  announceCta: 'Advertise these {count} slots to other teams',
  announced: 'Listing published: matching teams have been notified.',
  announceError: 'Could not publish the listing.',
  suggestionNeverPlayed:
    '{count} of you are free on {slot} — and you never play then.',
  suggestionRarelyPlayed:
    '{count} of you are free on {slot}, and you have only played then {played} time(s).',
  suggestionWhy:
    'This is the slot your team already has, without changing anything about how it is organised.',
  suggestionAnnounceCta: 'Look for a scrim on this slot',
  suggestionDismiss: 'Hide this suggestion',
};
