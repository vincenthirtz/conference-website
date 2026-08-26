// lib/i18n/locales/en/contactPage.ts
//
// Traductions ANGLAISES du namespace `contactPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/contactPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  badge: 'Contact & support',
  title: 'Contact us',
  intro:
    "Pick the fastest channel to reach the OW Women's Cup team: email, Discord or the direct form.",
  openForm: 'Open the form',
  writeEmail: 'Send an email',
  channelEmailTitle: 'Main email',
  channelEmailDesc:
    'General questions, sign-ups, follow-up on staff or team requests.',
  channelDiscordTitle: 'Community Discord',
  channelDiscordDesc:
    'Join the server to chat with the staff and the community.',
  channelDiscordCta: 'Discord server',
  channelPressTitle: 'Partnerships & press',
  channelPressDescBefore:
    'Brand collaborations, media or pro volunteering (design, casting, production) — see our',
  channelPressLink: 'current partners',
  channelPressDescAfter: '.',
  channelPressCta: 'Write to the staff',
  supportLabel: 'Support',
  supportHeading: 'What you can expect',
  supportDesc:
    'We centralise requests via email and the form to guarantee a reply.',
  helpPoint1:
    'Average response time: 24 to 48h outside live tournament periods.',
  helpPoint2:
    'If an incident happens during a match, ping the staff on Discord for a quick response.',
  helpPoint3:
    'Exchanges are moderated: respect and kindness towards every participant are required.',
  prepareTitle: 'What to include in your message',
  prepareDesc:
    "For team requests: team name, captains' BattleTag/Twitter, availability. For partnerships: goals, budget or planned counterparts.",
  formLabel: 'Form',
  formHeading: 'Send a message',
  formDisclaimerBefore:
    'By submitting this form, you agree that the information provided may be used to respond to your request. See the',
  formDisclaimerLink: 'legal notice',
  formDisclaimerAfter: '.',
};
