// lib/i18n/locales/en/onboardInviteBot.ts
//
// Traductions ANGLAISES du namespace `onboardInviteBot`.
//
// La SOURCE DE VERITE est le francais (`../fr/onboardInviteBot.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  stepBadge: 'Step 3/3',
  stepSub: 'Invite the bot',
  titleCompleted: 'Bot installed successfully',
  title: 'Invite the bot to your server',
  orgLabel: 'Organization:',
  slugLabel: '• slug:',
  blockedTitle: 'Request not ready',
  blockedStatusLabel: 'Current status:',
  blockedBody:
    ". This request isn't in a state that allows inviting the bot. You can",
  restart: 'start the request again',
  completedHeading: 'The bot is set up on your Discord server.',
  completedBody:
    "Your workspace is provisioned. Grab your keys (BOT_API_KEY, BOT_WEBHOOK_SECRET) below — they're shown only once. A backup email with the same link was also sent to you.",
  revealButton: 'Reveal my keys',
  revealedAlready:
    'Your keys have already been viewed. If you lost them, ask staff to rotate the secrets.',
  completedContact: 'Questions? Contact staff via',
  ourDiscord: 'our Discord',
  inviteIntroBefore:
    'Click the button below to open Discord and invite the bot to your server. You must have the',
  manageServerRole: 'Manage Server',
  inviteIntroAfter: 'role on the relevant guild.',
  noUrlBefore: 'Environment variable',
  noUrlAfter:
    'not configured — unable to generate the invite URL. Contact staff.',
  inviteButton: 'Invite the bot to my server',
  step1Before: 'Click',
  step1Highlight: 'Invite',
  step1After: '— a new Discord window opens.',
  step2:
    'Select your server from the list and authorize the requested permissions.',
  step3:
    "Come back to this page — we automatically detect the bot's arrival, then your keys appear here right after.",
  waiting: 'Waiting for the bot to arrive — checking every 5 seconds.',
  backToIntro: '← Back to the presentation',
};
