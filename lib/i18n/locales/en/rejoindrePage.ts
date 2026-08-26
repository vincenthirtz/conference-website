// lib/i18n/locales/en/rejoindrePage.ts
//
// Traductions ANGLAISES du namespace `rejoindrePage`.
//
// La SOURCE DE VERITE est le francais (`../fr/rejoindrePage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'No team?',
  heroTitle: "We'll find you a roster",
  heroSubtitle:
    "You don't need to show up with five friends. Add yourself here: captains who are recruiting see your profile and reach out.",
  heroNoAccount: 'No account needed',
  heroNoRank: 'No minimum rank',
  heroFree: 'Free',
  howTitle: 'How it works',
  how1Title: 'You fill in your profile',
  how1Desc:
    "Nickname, the roles you play, when you're available. Two minutes, no account required.",
  how2Title: 'Captains see you',
  how2Desc:
    'Your profile shows up in the list below and in the space used by recruiting teams.',
  how3Title: 'We put you in touch',
  how3Desc:
    'An interested captain writes to you. You create your account then — not before.',
  formTitle: 'Add yourself',
  formSubtitle:
    'Your profile stays visible for 60 days, then expires on its own.',
  nameLabel: 'Nickname',
  namePlaceholder: 'The name people know you by',
  rolesLabel: 'What do you play?',
  rolesHint: 'Pick as many as you like.',
  roleTank: 'Tank',
  roleDps: 'DPS',
  roleSupport: 'Support',
  roleFlex: 'Flex',
  levelLabel: 'Your level, roughly',
  levelUnknown: 'Not sure / just starting',
  levelBronze: 'Bronze',
  levelSilver: 'Silver',
  levelGold: 'Gold',
  levelPlatinum: 'Platinum',
  levelDiamond: 'Diamond',
  levelMaster: 'Master',
  levelGrandmaster: 'Grandmaster',
  levelChampion: 'Champion',
  levelHint:
    'There is no minimum rank to play. This only helps us suggest teams around your level.',
  availabilityLabel: "When you're available",
  availabilityPlaceholder: 'e.g. weekdays after 8pm, and Sunday afternoons',
  noteLabel: 'A word about you',
  notePlaceholder:
    "What you're looking for, your favourite heroes, whether you're new… (optional)",
  emailLabel: 'Your email',
  emailHint: 'Used only to put you in touch. It is never shown publicly.',
  emailPlaceholder: 'you@email.com',
  discordLabel: 'Your Discord handle',
  discordPlaceholder: 'handle (optional)',
  captchaLabel: 'Anti-bot — what is {question}?',
  captchaPlaceholder: 'Answer with a number',
  honeypotLabel: 'Do not fill in',
  submit: 'Publish my profile',
  submitting: 'Sending…',
  successTitle: "You're live!",
  successBody:
    "Your profile is published. Recruiting captains can contact you from now on. We're sending you a confirmation email: keep it, it contains the link to remove your profile whenever you want.",
  successAgain: 'Edit my profile',
  privacyNote:
    'Your email and Discord handle are only visible to signed-in captains. Your profile expires after 60 days, and you can remove it at any time using the link sent by email.',
  errorName: 'Enter a nickname (2 characters minimum).',
  errorEmail: 'Please enter a valid email address.',
  errorRoles: 'Pick at least one role.',
  errorGeneric: 'Sending failed. Please try again in a moment.',
  listTitle: "They're looking for a team",
  listSubtitle: 'Updated continuously.',
  listEmpty:
    'Nobody yet — be the first, and your profile will sit at the top of the list.',
  listError: 'The list could not be loaded.',
  listRetry: 'Try again',
  listCount: '{count} player(s) looking',
  listSince: 'Since {date}',
  listNoContact:
    'Contact details are not public: only signed-in captains can reach a player.',
  filterAll: 'All roles',
  altTitle: 'Already have a team?',
  altDesc: 'Register it for the tournament directly.',
  altCta: 'Create my team',
  discordTitle: 'Prefer Discord?',
  discordDesc:
    "The server is still there: take the “Looking for a team” role and you'll show up in this list too.",
  discordCta: 'Join the Discord',
  removeTitle: 'Remove my profile',
  removeIntro:
    'You are about to remove your profile from the public list. Captains will no longer see you or be able to contact you.',
  removeFor: "{name}'s profile",
  removeConfirm: 'Yes, remove my profile',
  removeWorking: 'Removing…',
  removeDoneTitle: 'Done',
  removeDoneBody:
    'Your profile has been removed. You can add yourself again whenever you like — it only takes two minutes.',
  removeBackCta: 'Back to the page',
  removeInvalidTitle: 'This link is no longer valid',
  removeInvalidBody:
    'Your profile may already have been removed, or it expired on its own after 60 days. If you think this is a mistake, get in touch with the staff.',
  removeContactStaff: 'Contact the staff',
  removeLoading: 'Checking the link…',
  removeError: 'Removal failed. Please try again in a moment.',
};
