// lib/i18n/locales/en/tournamentPodium.ts
//
// Traductions ANGLAISES du namespace `tournamentPodium`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentPodium.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Podium · {name}',
  metaDescription: 'Official final ranking of {name}.',
  backToTournament: '← Back to tournament',
  eyebrow: 'Final ranking',
  closedOn: 'Tournament closed on {date}',
  medalFirst: '1st place',
  medalSecond: '2nd place',
  medalThird: '3rd place',
  colRank: 'Rank',
  colTeam: 'Team',
  colPrize: 'Prize',
  colNotes: 'Notes',
};
