// lib/i18n/locales/en/teamAccess.ts
//
// Traductions ANGLAISES du namespace `teamAccess`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamAccess.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Team space access',
  badgeTeam: 'Team',
  badgeAction: 'Sign in',
  heading: 'Signing in to your team space',
  intro:
    "We're validating your sign-in link, then we'll take you straight to your team space.",
  loadingSession: 'Validating your sign-in link…',
  redirecting: 'Signed in, redirecting…',
  errorInvalidLink: 'This sign-in link is invalid or has expired.',
  errorNoSession:
    'Unable to establish the session. The link may have already been used.',
  errorCodeInvalid: 'Invalid sign-in link.',
  errorRestoreSession: 'Unable to restore the session.',
  singleUseNote: 'Sign-in links are single-use and expire quickly.',
  backToLogin: 'Sign in with a password',
};
