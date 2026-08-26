// lib/i18n/locales/en/pushOptIn.ts
//
// Traductions ANGLAISES du namespace `pushOptIn`.
//
// La SOURCE DE VERITE est le francais (`../fr/pushOptIn.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  msgAdmin:
    'Enable notifications to be alerted about matches, disputes and registrations, even when the tab is closed.',
  msgCaster:
    'Enable notifications to receive your cast assignments, briefings and Director signals, even out of session.',
  msgPlayer:
    'Enable notifications to receive your match, check-in, scrim and news alerts, even when the tab is closed.',
  msgPublic: 'Enable notifications to receive live event announcements.',
  cardTitle: 'Browser notifications',
  activating: 'Enabling...',
  activate: 'Enable',
  later: 'Later',
  errVapidMissing:
    'Notifications not configured on this server (VAPID key missing).',
  permDenied:
    'Permission denied. You can re-enable it from your browser settings.',
  successCaster:
    "Caster notifications enabled. You'll receive your assignments and Director signals.",
  successPlayer:
    "Notifications enabled. You'll receive your match, check-in and scrim alerts.",
  successDefault:
    "Notifications enabled. You'll receive match, scrim and support alerts.",
  errActivate: 'Unable to enable notifications. Try again later.',
};
