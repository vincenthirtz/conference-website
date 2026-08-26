// lib/i18n/locales/en/embedStandings.ts
//
// Traductions ANGLAISES du namespace `embedStandings`.
//
// La SOURCE DE VERITE est le francais (`../fr/embedStandings.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Standings',
  empty: "This tournament's standings are not available yet.",
  viewOn: 'View on {site}',
  rank: 'Rank',
  team: 'Team',
  prize: 'Prize',
};
