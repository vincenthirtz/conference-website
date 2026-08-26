// lib/i18n/locales/en/error403.ts
//
// Traductions ANGLAISES du namespace `error403`.
//
// La SOURCE DE VERITE est le francais (`../fr/error403.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: "Access denied | OW Women's Cup",
  heading: 'Access denied',
  body: "You don't have the permissions required to access this page. If you think this is a mistake, contact the team.",
  backHome: 'Back to home',
  signIn: 'Sign in',
  needHelp: 'Need help?',
};
