// lib/i18n/locales/en/battlenetLogin.ts
//
// Traductions ANGLAISES du namespace `battlenetLogin`.
//
// La SOURCE DE VERITE est le francais (`../fr/battlenetLogin.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: "Battle.net sign-in – OW Women's Cup",
  heading: 'Signing you in',
  intro:
    "We're validating your Battle.net sign-in and taking you to your space.",
  loadingSession: 'Checking the link…',
  redirecting: 'Signed in! Redirecting…',
  errorInvalidLink: 'This sign-in link is invalid or has expired.',
  errorNoSession:
    'Could not establish the session. Start again from the sign-in page.',
  singleUseNote: 'This link is single-use and expires quickly.',
  backToLogin: 'Back to sign-in',
};
