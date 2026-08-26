// lib/i18n/locales/en/tournamentTeams.ts
//
// Traductions ANGLAISES du namespace `tournamentTeams`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentTeams.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Teams · {name}',
  metaDescription: 'All teams registered for the {name} tournament.',
  eyebrow: 'Tournament · Teams',
  heading: 'Registered teams',
  teamsCount_one: '· {count} team',
  teamsCount_other: '· {count} teams',
  empty: 'No team registered yet.',
  backToTournament: 'Back to tournament',
};
