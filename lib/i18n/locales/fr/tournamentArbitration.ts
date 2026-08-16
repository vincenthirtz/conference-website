// lib/i18n/locales/fr/tournamentArbitration.ts
//
// Traductions FRANCAISES du namespace `tournamentArbitration` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentArbitration', {
  heading: 'Arbitrage & litiges',
  description: 'Transparence sur la résolution des litiges de ce tournoi.',
  statTotalDisputes: 'Litiges',
  statResolved: 'Résolus',
  statOpen: 'Ouverts',
  statMedianResolution: 'Résolution médiane',
  statSlaCompliance: 'Conformité SLA',
  avgHint: 'Moyenne : {value}',
  slaTarget: 'SLA : {minutes} min',
  withinSlaHint: '{count} dans les délais',
  na: 'n/a',
  openBreakdownHeading: 'Répartition des litiges ouverts',
  breached: 'Hors délai',
  approaching: 'Proche du délai',
  fresh: 'Dans les temps',
  noDisputesTitle: 'Aucun litige',
  noDisputesText: 'Tournoi serein — aucun litige à arbitrer.',
  durationMinutes: '{count} min',
  durationHours: '{hours} h {minutes} min',
  durationHoursOnly: '{hours} h',
  loading: "Chargement des données d'arbitrage…",
});
