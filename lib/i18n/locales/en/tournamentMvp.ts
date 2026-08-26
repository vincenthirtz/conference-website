// lib/i18n/locales/en/tournamentMvp.ts
//
// Traductions ANGLAISES du namespace `tournamentMvp`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentMvp.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: '{name} · Tournament MVP',
  eyebrow: 'Tournament · MVP',
  heading: 'Tournament MVP',
  intro:
    'Ranking of the players voted MVP through the Discord poll after each match. {awards} MVP award(s) over {matches} finished match(es).',
  backToTournament: '← Back to tournament',
  teamStats: 'Team stats',
  allMatches: 'All matches',
  empty:
    'No MVP has been named on this tournament yet. MVPs are imported manually by the staff after the Discord poll.',
  colPlayer: 'Player',
  colTeam: 'Team',
  colMvp: 'MVP',
  unknownPlayer: 'Unknown player',
  perMatchHeading: 'MVP per match',
  viewMatch: 'View match',
};
