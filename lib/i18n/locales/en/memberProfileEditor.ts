// lib/i18n/locales/en/memberProfileEditor.ts
//
// Traductions ANGLAISES du namespace `memberProfileEditor`.
//
// La SOURCE DE VERITE est le francais (`../fr/memberProfileEditor.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  captain: 'Captain',
  substitute: 'Substitute',
  memberFallback: 'Member',
  displayNameLabel: 'Display name',
  displayNamePlaceholder: 'E.g. Lyra',
  specialtyLabel: 'Specialty',
  specialtyNone: 'Unspecified',
  avatarLabel: 'Avatar (https URL)',
  pronounsLabel: 'Pronouns',
  pronounsPlaceholder: 'she, they, she/her',
  taglineLabel: 'Profile tagline',
  taglinePlaceholder: 'E.g. Feared sniper.',
  twitterLabel: 'Twitter',
  twitchLabel: 'Twitch',
  updateSuccess_one: 'Profile updated ({count} field).',
  updateSuccess_other: 'Profile updated ({count} fields).',
  noChanges: 'No changes.',
  errorUnexpected: 'Unexpected error.',
  saving: 'Saving...',
  save: 'Save this member',
};
