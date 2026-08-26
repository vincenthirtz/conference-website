// lib/i18n/locales/en/ffaStandings.ts
//
// Traductions ANGLAISES du namespace `ffaStandings`.
//
// La SOURCE DE VERITE est le francais (`../fr/ffaStandings.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'FFA standings · {name}',
  metaDescription:
    'Free-For-All standings for {name}: total points, lobbies played, best placement and number of wins per team.',
  title: 'FFA standings',
  eyebrow: 'Free-For-All',
  heading: 'FFA standings',
  backToTournament: '← Back to tournament',
  viewOn: 'View on {site}',
  colRank: 'Rank',
  colTeam: 'Team',
  colPoints: 'Points',
  colLobbies: 'Lobbies',
  colBest: 'Best placement',
  colFirsts: 'Wins',
  empty: 'No FFA results are available for this tournament yet.',
};
