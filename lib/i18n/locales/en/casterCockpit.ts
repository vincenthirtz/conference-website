// lib/i18n/locales/en/casterCockpit.ts
//
// Traductions ANGLAISES du namespace `casterCockpit`.
//
// La SOURCE DE VERITE est le francais (`../fr/casterCockpit.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  connecting: 'Connecting to the cockpit...',
  accessInactiveTitle: 'Caster access inactive',
  accessInactiveBody:
    'Your account is authenticated, but no active caster profile is linked to it in this tenant. Contact an admin to enable your access.',
  signOut: 'Sign out',
  connectionErrorTitle: 'Connection error',
  connectionErrorBody:
    'Unable to load your caster profile. Check your internet connection and try again.',
  retry: 'Retry',
  docTitle: "Caster cockpit | OW Women's Cup",
  loadingRun: 'Loading the current run...',
  loadError: 'Loading error.',
  errorWithStatus: 'Error {status}',
  signedOut: 'You are signed out.',
  sessionExpired: 'Session expired — reconnecting…',
  wakeLockUnsupported:
    'Your browser may let the screen turn off — install the PWA or keep the app active.',
};
