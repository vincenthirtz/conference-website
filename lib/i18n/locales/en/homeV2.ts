// lib/i18n/locales/en/homeV2.ts
//
// Traductions ANGLAISES du namespace `homeV2`.
//
// La SOURCE DE VERITE est le francais (`../fr/homeV2.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  loadError:
    "Some of the content couldn't be loaded. Please try again in a moment.",
  announceAria: 'Announcement',
  announceCta: 'Learn more',
  announceDismiss: 'Dismiss announcement',
  heroEyebrow: "Overwatch tournament · 100% women's",
  heroTagline:
    'The competition that puts women players at the heart of the game.',
  heroTaglineStrong: 'Teams, a cash prize, live casts.',
  heroCtaRegister: 'Register my team',
  heroTournamentFull: 'Tournament full',
  heroTournamentFullHint: 'All {count} spots for the {year} edition are taken.',
  heroCtaCreateTeam: 'Create my team',
  heroCtaDiscord: 'Join the Discord',
  heroTrust: '100% women · Live FR casts · Community-funded prize pool',
  stepsEyebrow: 'Take part',
  stepsTitle: 'Join the competition in 3 steps',
  stepsCta: 'Register my team',
  step1Title: 'Find or build your team',
  step1Desc:
    'No team? Add yourself in two minutes, no account needed: recruiting captains reach out to you. Already have a roster? Build it directly.',
  step2Title: 'Register your team',
  step2Desc:
    "In a few clicks: name, players, availability. Your captain confirms, and you're on the bracket.",
  step3Title: 'Play your matches, live',
  step3Desc:
    'Follow the schedule, play your games and catch the highlights cast in French on Twitch.',
  statusLive: 'Live now',
  statusNext: 'Next event in',
  cdDays: 'days',
  cdHours: 'h',
  cdMinutes: 'min',
  cdSeconds: 'sec',
  spotEyebrow: 'The event',
  spotTitle: 'The next event',
  spotSeeTournament: 'View the tournament',
  spotChipLive: 'Live',
  spotChipOpen: 'Sign-ups open',
  spotFactFormat: 'Format',
  spotFactPrize: 'Cash prize',
  spotFactTeams: 'Teams',
  spotProgressAria: '{pct}% of slots taken',
  spotCtaRegister: 'Register my team',
  spotCtaView: 'View the tournament',
  spotCtaTeams: 'View registered teams',
  spotLiveNow: 'Live on Twitch',
  spotLiveIframeTitle: 'Live Twitch player',
  spotViewers_one: '{count} viewer watching',
  spotViewers_other: '{count} viewers watching',
  spotTwitchHandle: 'Twitch · womens_cup',
  spotNextLive: 'The player opens here when the channel goes live.',
  spotNextLiveHint: 'Follow on Twitch →',
  newsEyebrow: 'News',
  newsTitle: 'Latest news',
  newsAll: 'All news',
  newsRead: 'Read',
  newsExcerptFallback: 'Discover the latest news from the competition.',
  newsEmpty: 'No news yet. Check back soon!',
  supportLead:
    'They support the competition · they broadcast it · they talk about it',
  supportPartnersLink: 'View all partners',
  heroCtaJoin: "I'm looking for a team",
};
