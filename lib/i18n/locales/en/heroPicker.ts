// lib/i18n/locales/en/heroPicker.ts
//
// Traductions ANGLAISES du namespace `heroPicker`.
//
// La SOURCE DE VERITE est le francais (`../fr/heroPicker.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  teamADefault: 'Team A',
  teamBDefault: 'Team B',
  title: 'Test – Hero Picker',
  cooldownBadge: 'Cooldown: {seconds}s',
  banBadge: 'Ban in progress: {seconds}s',
  intro:
    'A little sandbox to test a hero picker (inspired by https://github.com/geddski/overwatch-hero-picker), pick a favorite and simulate bans for two teams.',
  cooldownBeforeBan: 'Cooldown before ban',
  waitingSquadTitle: 'Waiting for the rest of the team…',
  waitingSquadBody:
    'Your vote is recorded. The ban phase is locked until the squad validates.',
  favoriteColon: 'Favorite:',
  banColon: 'Ban:',
  bannedLabel: 'Banned:',
  currentPhaseLabel: 'Current phase:',
  phaseFavorite: 'Pick a favorite (click a card)',
  phaseCooldown: 'Cooldown before ban: {seconds}s',
  phaseBan: 'Pick a ban (click a card) – {seconds}s left',
  phaseDone: 'Vote complete',
  favoriteColonCompact: 'Favorite:',
  banColonCompact: 'Ban:',
  voteSectionTitle: 'Vote favorites & bans (2 teams)',
  teamANameLabel: 'Team A name',
  teamBNameLabel: 'Team B name',
  chooseTeam: 'Choose your team',
  clickFavorite: 'Click a card to pick a favorite',
  clickBan: 'Click a card to pick a ban',
  cooldownInProgress: 'Cooldown in progress... {seconds}s',
  voteComplete: 'Vote complete recorded.',
  votesLabel: '{name} — {count} vote(s)',
  mostVotedBan: 'Most voted ban:',
  banVotesInfo: '{hero} ({count} vote(s), {percent}%)',
  noVote: 'No vote.',
};
