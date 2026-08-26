// lib/i18n/locales/en/tournamentBracket.ts
//
// Traductions ANGLAISES du namespace `tournamentBracket`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentBracket.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: "Bracket – {name} | OW Women's Cup",
  heading: 'Bracket – {name}',
  description:
    "The tournament tree: follow every team's run, round by round, all the way to the final.",
  statusUpcoming: 'Upcoming',
  statusOngoing: 'Ongoing',
  statusFinished: 'Finished',
  winnersBracket: 'Winners Bracket',
  losersBracket: 'Losers Bracket',
  emptyTitle: 'Bracket coming soon',
  emptyBody:
    "The tournament tree isn't published yet. In the meantime, check the match list.",
  viewMatches: 'View matches',
};
