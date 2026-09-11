// lib/i18n/locales/en/recrutementPage.ts
//
// Traductions ANGLAISES du namespace `recrutementPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/recrutementPage.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'One player short?',
  heroTitle: 'Teams that are recruiting',
  heroSubtitle:
    'Post your opening here: players looking for a team see it, and applications come to you. Two minutes, no account required.',
  heroNoAccount: 'No account needed',
  heroFast: 'Two minutes',
  heroFree: 'Free',
  howTitle: 'How it works',
  how1Title: 'You describe what you need',
  how1Desc:
    "Your team name, the roles you're missing, your practice slots. Nothing else is required.",
  how2Title: 'Players see you',
  how2Desc:
    'Your opening shows up in the list below, and Discord relays new openings.',
  how3Title: 'You recruit',
  how3Desc:
    'An interested player reaches out — or you go the other way and pick from the list of free players.',
  formTitle: 'Post an opening',
  formSubtitle:
    'Your opening stays visible for 60 days, then expires on its own.',
  teamNameLabel: 'Your team name',
  teamNamePlaceholder: 'The name people know you by',
  rolesLabel: 'Which roles are you looking for?',
  rolesHint: 'Pick as many as you like.',
  roleTank: 'Tank',
  roleDps: 'DPS',
  roleSupport: 'Support',
  roleFlex: 'Flex',
  levelLabel: "Your team's level, roughly",
  levelUnknown: 'Any level / mixed roster',
  levelBronze: 'Bronze',
  levelSilver: 'Silver',
  levelGold: 'Gold',
  levelPlatinum: 'Platinum',
  levelEmerald: 'Emerald',
  levelDiamond: 'Diamond',
  levelMaster: 'Master',
  levelGrandmaster: 'Grandmaster',
  levelChampion: 'Champion',
  levelHint:
    'This only helps players place you: nothing stops you from recruiting outside that range.',
  availabilityLabel: 'Your slots',
  availabilityPlaceholder: 'e.g. practice on Tuesday and Thursday at 8.30pm',
  noteLabel: 'A word about the team',
  notePlaceholder:
    'Your vibe, your goals, what you expect from a new player… (optional)',
  emailLabel: 'Your email',
  emailHint: 'Used only to receive applications. It is never shown publicly.',
  emailPlaceholder: 'you@email.com',
  discordLabel: 'Your Discord handle',
  discordPlaceholder: 'handle (optional)',
  discordHint:
    'Optional, but handy: with your handle, a player can DM you directly instead of waiting for you to check your inbox.',
  captchaLabel: 'Anti-bot — what is {question}?',
  captchaPlaceholder: 'Answer with a number',
  honeypotLabel: 'Do not fill in',
  submit: 'Publish my opening',
  submitting: 'Sending…',
  successTitle: "You're live!",
  successBody:
    'Your opening is published. Interested players will email you — or DM you on Discord if you filled in your handle.',
  successDiscordBody:
    'The rest happens on the server: your opening is relayed there, and that is where free players show up day to day.',
  successDiscordCta: 'Join the Discord',
  successAgain: 'Post another opening',
  privacyNote:
    'Your email and Discord handle are never public: the list below only shows the team name, the roles wanted and your slots. Your opening expires after 60 days.',
  errorTeamName: 'Enter your team name (2 characters minimum).',
  errorEmail: 'Please enter a valid email address.',
  errorRoles: 'Pick at least one role you are looking for.',
  errorGeneric: 'Sending failed. Please try again in a moment.',
  listTitle: "They're looking for a player",
  listSubtitle: 'Updated continuously.',
  listEmpty:
    'No opening yet — be the first, and yours will sit at the top of the list.',
  listError: 'The list could not be loaded.',
  listRetry: 'Try again',
  listCount: '{count} team(s) recruiting',
  listSince: 'Since {date}',
  listNoContact:
    'Team contact details are not public: answer an opening from Discord, or add yourself on the “Find a team” page.',
  filterAll: 'All roles',
  altTitle: 'Looking for a team, not for a player?',
  altDesc:
    'Same door, other side: add yourself and recruiting captains will reach out to you.',
  altCta: "I'm looking for a team",
  discordTitle: 'Recruiting lives on Discord',
  discordDesc:
    'Openings are relayed there, and free players show up with the “Looking for a team” role. Posting here and there is not a duplicate.',
  discordCta: 'Join the Discord',
};
