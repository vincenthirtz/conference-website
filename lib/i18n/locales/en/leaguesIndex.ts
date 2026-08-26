// lib/i18n/locales/en/leaguesIndex.ts
//
// Traductions ANGLAISES du namespace `leaguesIndex`.
//
// La SOURCE DE VERITE est le francais (`../fr/leaguesIndex.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusDraft: 'Draft',
  statusActive: 'Ongoing',
  statusFinished: 'Finished',
  statusArchived: 'Archived',
  eyebrow: 'Leagues',
  heading: 'Leagues & seasons',
  subtitle:
    'Follow cumulative standings across several tournaments. Points are awarded based on the final ranking of each tournament of the season.',
  emptyHeading: 'No published league',
  emptyBody: 'No season is available at the moment. Come back soon!',
  errorHeading: 'Unable to load the leagues',
  errorBody: 'An error occurred. Try again in a few moments.',
  retry: 'Retry',
};
