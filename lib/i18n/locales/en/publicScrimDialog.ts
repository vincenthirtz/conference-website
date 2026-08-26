// lib/i18n/locales/en/publicScrimDialog.ts
//
// Traductions ANGLAISES du namespace `publicScrimDialog`.
//
// La SOURCE DE VERITE est le francais (`../fr/publicScrimDialog.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Propose a scrim to {teamName}',
  subtitle:
    'The captain will receive your request and can reply via the contact you provide below.',
  close: 'Close',
  fromTeamLabel: 'Requesting team',
  fromTeamPlaceholder: "Your team's name",
  nameLabel: 'Contact name',
  namePlaceholder: 'Username or first name',
  emailLabel: 'Email',
  emailPlaceholder: 'contact@example.com',
  discordLabel: 'Discord (optional)',
  discordPlaceholder: 'username or Discord invite',
  dateLabel: 'Preferred date',
  formatLabel: 'Format',
  formatPlaceholder: 'e.g. 5v5 BO3',
  messageLabel: 'Message (optional)',
  messagePlaceholder: 'Specify your availability, the server, etc.',
  captchaLabel: 'Anti-bot — what is {question}?',
  captchaPlaceholder: 'Answer with a number',
  cancel: 'Cancel',
  submitting: 'Sending…',
  submit: 'Send the request',
  errorFailed: 'Request failed.',
  successFallback: 'Request sent.',
  errorUnknown: 'Unknown error.',
};
