// lib/i18n/locales/en/playerMessages.ts
//
// Traductions ANGLAISES du namespace `playerMessages`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerMessages.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Messages',
  selectTeamError: 'Select a team.',
  gateTitle: 'Captain messaging',
  gateNoTeam: 'You must be a member of a team to access messaging.',
  gateNotCaptain: 'Only the team captain can use messaging.',
  backToSpace: 'Back to my space',
  inbox: 'Inbox',
  newMessageHeader: 'New message',
  newButton: 'New',
  loading: 'Loading...',
  noConversations: 'No conversations',
  noConversationsHint: 'Send a first message to another captain.',
  sendTo: 'Send a message to',
  searchTeam: 'Search for a team...',
  noTeamFound: 'No team found',
  composePlaceholder: 'Your message...',
  sending: 'Sending...',
  send: 'Send',
  noMessages: 'No messages in this conversation.',
  replyPlaceholder: 'Write a message...',
  sendingShort: '...',
  yesterday: 'Yesterday',
  loadError: "Couldn't load conversations. Please try again later.",
  composeLabel: 'Your message',
  replyLabel: 'Write a reply',
  conversationLabel: 'Conversation thread',
};
