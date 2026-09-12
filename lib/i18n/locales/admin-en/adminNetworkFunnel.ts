// lib/i18n/locales/admin-en/adminNetworkFunnel.ts
//
// Traductions ANGLAISES du namespace admin `adminNetworkFunnel`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminNetworkFunnel.ts`) :
// toute cle ajoutee la-bas doit l'etre ici avec exactement la meme structure,
// sans quoi le garde-fou de compilation `../admin-parity.ts` casse le
// typecheck.

export default {
  pageTitle: 'Admin – Network',
  heading: 'Network funnel',
  subtitle:
    'Where players stop, between creating an account and their first game together. Each step asks for one more commitment than the last.',

  stepsHeading: 'The steps',
  stepAccounts: 'Accounts created',
  stepAccountsHint: 'Every sign-up, all roles included.',
  stepDiscord: 'Discord linked',
  stepDiscordHint: 'Without a Discord link, no bot DM and no synced role.',
  stepBattlenet: 'BattleTag verified',
  stepBattlenetHint: 'A real Blizzard verification, not a self-declared field.',
  stepProfiles: 'Player card created',
  stepProfilesHint: 'The card exists — visible or not.',
  stepDiscoverable: 'Card visible',
  stepDiscoverableHint:
    'The only number that makes someone findable. Invisible by default, and that is deliberate.',
  stepFollows: 'Follow links',
  stepFollowsHint: 'Number of follows, not of people.',
  stepScrims: 'Scrim requests',
  stepScrimsHint: 'All statuses: intent is what matters here.',

  marketsHeading: 'The no-account doors',
  marketsHint:
    'Neither market requires an account: they are entrances, not funnel steps.',
  marketFreePlayers: '“Looking for a team” listings',
  marketTeamOpenings: '“We are recruiting” listings',
  marketsActiveOnly: 'Listings still active (expired ones are excluded).',

  scopeGlobal: 'whole network',
  scopeTenant: 'this space',
  ofPrevious: '{pct}% of the previous step',
  unknown: 'unknown',
  unknownHint: 'The count failed — this is not a zero.',

  loading: 'Loading the funnel…',
  loadError: 'Could not load the funnel.',
  retry: 'Retry',
};
