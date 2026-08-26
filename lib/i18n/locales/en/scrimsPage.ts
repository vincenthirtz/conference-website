// lib/i18n/locales/en/scrimsPage.ts
//
// Traductions ANGLAISES du namespace `scrimsPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/scrimsPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Scrims',
  subtitle:
    'The friendly match sessions organised between our teams. Each scrim gathers several matches played over a day.',
  emptyBefore: 'No public scrim yet. Captains can propose one from',
  emptyLink: 'the scrim page',
  emptyAfter: '.',
  sectionRunning: 'Live',
  sectionUpcoming: 'Upcoming',
  sectionPast: 'Finished',
  vs: 'vs',
  dateTbd: 'Date to be defined',
  teamTbd: 'to be defined',
  statusScheduled: 'Scheduled',
  statusRunning: 'Live',
  statusCompleted: 'Finished',
  statusCancelled: 'Cancelled',
  ladderTitle: 'Scrim standings',
  ladderSubtitle:
    'Based on scrims reported by both teams. Distinct from tournament rankings: this measures practice.',
  ladderTeam: 'Team',
  ladderPlayed: 'P',
  ladderRecord: 'W-D-L',
  ladderDiff: 'Diff.',
  ladderPoints: 'Pts',
};
