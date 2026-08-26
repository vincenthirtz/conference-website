// lib/i18n/locales/admin-en/adminScrimPlanningsList.ts
//
// Traductions ANGLAISES du namespace admin `adminScrimPlanningsList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminScrimPlanningsList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Scrim grids',
  heading: 'Scrim planning',
  subtitle: 'Shared availability grids to schedule a scrim between 2 teams.',
  backScrims: '← Back to scrims',
  newPlanning: '+ New grid',
  statusFilterLabel: 'Status',
  filterAll: 'All',
  statusOpen: 'Open',
  statusValidated: 'Validated',
  statusClosed: 'Closed',
  statusCancelled: 'Cancelled',
  loading: 'Loading…',
  empty: 'No grid for this filter.',
  untitled: 'Untitled grid',
  teamsVs: '{team1} vs {team2}',
  validatedSlot: 'Validated slot: {when}',
  linkedScrim: '• Scrim created',
};
