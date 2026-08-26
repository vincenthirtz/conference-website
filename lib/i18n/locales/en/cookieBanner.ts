// lib/i18n/locales/en/cookieBanner.ts
//
// Traductions ANGLAISES du namespace `cookieBanner`.
//
// La SOURCE DE VERITE est le francais (`../fr/cookieBanner.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Cookie settings',
  description:
    'We use cookies to keep the site running smoothly and improve your experience. You can customise your preferences below.',
  essentialName: 'Essential cookies',
  essentialDesc:
    'Required for the site to work (authentication, security). These cookies cannot be disabled.',
  functionalName: 'Functional cookies',
  functionalDesc: 'Improve your experience (preferences, personalisation).',
  analyticsName: 'Analytics cookies',
  analyticsDesc:
    'Help us understand how you use the site so we can improve it.',
  marketingName: 'Marketing cookies',
  marketingDesc: 'Used to display relevant advertising.',
  required: 'Required',
  customize: 'Customise',
  hideDetails: 'Hide details',
  saveChoices: 'Save my choices',
  refuse: 'Decline',
  acceptAll: 'Accept all',
  legalPrefix: 'Learn more in our',
  privacyPolicy: 'privacy policy',
  manage: 'Manage cookies',
  manageAria: 'Manage cookie preferences',
};
