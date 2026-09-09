// lib/i18n/locales/en/regieNewRun.ts
//
// Traductions ANGLAISES du namespace `regieNewRun`.
//
// La SOURCE DE VERITE est le francais (`../fr/regieNewRun.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Start a new run',
  description:
    'No run is live. Create a run and start it to open the control desk.',
  tournamentHint:
    'A run can be fully free-form: neither a tournament nor a scrim is required.',
  nameLabel: 'Run name',
  namePlaceholder: 'e.g. Launch night',
  scheduledLabel: 'Scheduled date',
  sourceLabel: 'Linked competition (optional)',
  sourceNone: 'None (free-form run)',
  sourceTournament: 'Tournament',
  sourceScrim: 'Scrim',
  tournamentLabel: 'Linked tournament (optional)',
  tournamentNone: 'None (free-form run)',
  scrimLabel: 'Linked scrim',
  scrimNone: 'Pick a scrim…',
  scrimEmpty: 'No scrim available.',
  listLoading: 'Loading…',
  listError: 'Could not load: {message}',
  listRetry: 'Retry',
  submit: 'Create and start',
  submitting: 'Starting…',
  nameRequired: 'The run name is required.',
  createSuccess: 'Run created and started.',
  createError: 'Could not create or start the run.',
  segmentsCreated_one: '{count} segment added from the tournament.',
  segmentsCreated_other: '{count} segments added from the tournament.',
  matchesCreated_one: '{count} match added from the scrim.',
  matchesCreated_other: '{count} matches added from the scrim.',
  fromTournamentError:
    'The run was created but the tournament segments could not be added. You can start it via “Start a prepared run” or complete it in the Director.',
  fromScrimError:
    'The run was created but the scrim matches could not be added. You can start it via “Start a prepared run” or complete it in the Director.',
};
