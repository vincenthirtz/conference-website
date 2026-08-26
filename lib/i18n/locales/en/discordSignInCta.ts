// lib/i18n/locales/en/discordSignInCta.ts
//
// Traductions ANGLAISES du namespace `discordSignInCta`.
//
// La SOURCE DE VERITE est le francais (`../fr/discordSignInCta.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  defaultLabel: 'Sign in with Discord',
  redirecting: 'Redirecting…',
  errorLink: 'Unable to link your Discord account.',
  errorStart: 'Unable to start the Discord sign-in.',
  errorGeneric: 'Something went wrong with Discord. Try again in a moment.',
};
