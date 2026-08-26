// lib/i18n/locales/en/authDiscordMember.ts
//
// Traductions ANGLAISES du namespace `authDiscordMember`.
//
// La SOURCE DE VERITE est le francais (`../fr/authDiscordMember.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusConnecting: 'Connecting via Discord…',
  statusValidating: 'Validating the connection…',
  statusSessionNotFound: 'Session not found. Redirecting to home.',
  statusCheckingPerms: 'Checking permissions…',
  statusNoStaffAccess: 'No staff access. Redirecting to home…',
  statusRedirecting: 'Redirecting…',
  statusConnectionError: 'Connection error. Redirecting to home…',
  errNoStaff:
    'Your account has no staff access. Contact an admin if this is a mistake.',
  errConnection: 'Discord connection error. Try again.',
  waitMessage: 'Please wait while the connection is finalized.',
};
