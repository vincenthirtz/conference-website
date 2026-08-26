// lib/i18n/locales/en/palmaresPage.ts
//
// Traductions ANGLAISES du namespace `palmaresPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/palmaresPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  eyebrow: 'Hall of fame',
  title: 'The player hall of fame',
  subtitle:
    'Titles, finals and podiums across every tournament of the circuit. A player is credited with the results of the tournaments she actually played with her team.',
  leaderboardLink: 'See the rating leaderboard →',
  rankShort: '#{rank}',
  unknownPlayer: 'Unknown player',
  unknownTournament: 'Tournament',
  emptyTitle: 'No hall of fame yet',
  emptyBody:
    'The hall of fame will fill up as soon as a tournament is closed with its final standings. Come back after the next edition!',
  statTitles_one: 'title',
  statTitles_other: 'titles',
  statFinals_one: 'final',
  statFinals_other: 'finals',
  statPodiums_one: 'podium',
  statPodiums_other: 'podiums',
  statMvps_one: 'MVP',
  statMvps_other: 'MVP',
  rankFirst: '1st',
};
