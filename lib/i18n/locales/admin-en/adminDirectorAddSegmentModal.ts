// lib/i18n/locales/admin-en/adminDirectorAddSegmentModal.ts
//
// Traductions ANGLAISES du namespace admin `adminDirectorAddSegmentModal`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDirectorAddSegmentModal.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  titleRequired: 'The title is required.',
  matchIdRequired:
    'For a "match" type segment, a valid match_id (UUID) is required.',
  durationPositive: 'The duration must be a positive integer (in minutes).',
  createFailed: 'Creation failed.',
  heading: 'Add a segment',
  subtitle: 'The segment will be added at the end of the timeline.',
  typeLabel: 'Type',
  titleLabel: 'Title',
  matchLabel: 'Match',
  matchHint:
    'Search by team or tournament name. Only upcoming or unscheduled matches appear.',
  matchPlaceholder: 'Quarter 1: Team A vs Team B',
  durationLabel: 'Planned duration (minutes)',
  durationPlaceholder: 'e.g. 30',
  cancel: 'Cancel',
  submitting: 'Adding…',
  submit: 'Add',
};
