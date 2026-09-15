// lib/i18n/locales/en/tcgSets.ts
//
// Traductions ANGLAISES du namespace `tcgSets`.
// La SOURCE DE VERITE est le francais (`../fr/tcgSets.ts`) : toute cle
// ajoutee la-bas doit l'etre ici (garde-fou : `locales/parity.ts`).

export default {
  title: 'Sets',
  intro: 'Complete a set to receive {coins} coins — once per set.',
  introNoReward:
    'Groups of cards to complete: every map of a mode, the teams of an edition, a team’s roster.',
  privacyNote:
    'For players, we tell you how many cards you are missing, never which ones.',
  loading: 'Loading sets…',
  error: 'Your sets cannot be loaded right now.',
  retry: 'Try again',
  empty: 'No set to complete yet.',

  labelMapMode: 'Maps — {mode}',
  labelTournamentTeams: 'Teams — {tournament}',
  labelTeamRoster: '{team} roster — {tournament}',
  unknownTeam: 'team',
  unknownTournament: 'edition',
  modeControl: 'Control',
  modeEscort: 'Escort',
  modeHybrid: 'Hybrid',
  modePush: 'Push',
  modeFlashpoint: 'Flashpoint',

  progress: '{owned} of {total}',
  progressAria: 'Progress of the set {label}',
  complete: 'Set complete',
  rewarded: 'Reward received',
  rewardedIncomplete:
    'Reward already received — a card has left your collection since.',
  missingNamed: 'Missing: {names}',
  missingPlayers_one: '1 player card to find',
  missingPlayers_other: '{count} player cards to find',

  showAll: 'See all sets ({count})',
  showLess: 'See fewer sets',

  justCompleted: 'Set completed: {label}. +{coins} coins.',
};
