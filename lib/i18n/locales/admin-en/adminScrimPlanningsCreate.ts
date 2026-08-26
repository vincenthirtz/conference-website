// lib/i18n/locales/admin-en/adminScrimPlanningsCreate.ts
//
// Traductions ANGLAISES du namespace admin `adminScrimPlanningsCreate`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminScrimPlanningsCreate.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'New scrim grid',
  subtitle: 'Generates a shared availability grid between two teams.',
  team1Label: 'Team 1',
  team2Label: 'Team 2',
  teamPlaceholder: '— Choose —',
  titleLabel: 'Title',
  titlePlaceholder: 'Friendly scrim',
  gameLabel: 'Game',
  horizonStartLabel: 'Horizon start',
  horizonDaysLabel: 'Number of days',
  slotMinutesLabel: 'Granularity',
  slot30: '30 min',
  slot60: '60 min',
  dayStartLabel: 'Day start',
  dayEndLabel: 'Day end',
  timezoneLabel: 'Timezone',
  timezoneCommon: 'Common',
  timezoneAll: 'All timezones',
  submit: 'Create grid',
  submitting: 'Creating…',
  cancel: 'Cancel',
  created: 'Grid created.',
  errorTeamsRequired: 'Both teams are required.',
  errorTeamsDistinct: 'The two teams must be distinct.',
  errorTimeBand: 'Day end must be after day start.',
  errorCreate: 'Creation error.',
  errorDuplicateDemande: 'A grid already exists for this scrim request.',
  staffRequiredLabel: 'Staff required',
  staffRequiredHelp:
    'A slot is only schedulable when staff is also available (all 3 parties).',
};
