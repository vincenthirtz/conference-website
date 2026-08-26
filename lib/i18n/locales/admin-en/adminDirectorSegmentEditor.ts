// lib/i18n/locales/admin-en/adminDirectorSegmentEditor.ts
//
// Traductions ANGLAISES du namespace admin `adminDirectorSegmentEditor`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDirectorSegmentEditor.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  assignFailed: 'Assignment failed.',
  titleRequired: 'The title is required.',
  durationPositive: 'The duration must be a positive integer (in minutes).',
  anchorNoDate: "Unable to anchor: the run's date is missing.",
  anchorInvalid: 'Invalid anchor time. Expected format: HH:MM.',
  checklistIncomplete: 'Each checklist item must have a key and a label.',
  checklistDuplicate: 'Duplicate checklist key: "{key}".',
  saveFailed: 'Save failed.',
  selectPrompt: 'Select a segment in the timeline to edit it.',
  heading: 'Edit the segment',
  typeOrd: 'Type: {type} · ord {ord}',
  saving: 'Saving…',
  save: 'Save',
  scheduleHeading: 'Schedule',
  anchored: 'Anchored',
  autoComputed: 'Auto (computed)',
  release: 'Release',
  computedHelp: 'The schedule is computed from the preceding segments.',
  anchorAction: 'Anchor this schedule',
  assignHeading: 'Assignment',
  waveLabel: 'Wave',
  stationLabel: 'Station',
  none: '— none',
  titleLabel: 'Title',
  durationLabel: 'Planned duration (minutes)',
  durationPlaceholder: 'e.g. 30',
  linkedMatch: 'Linked match:',
  linkedMatchHint: '(the match_id is set when the segment is created.)',
  broadcastHeading: 'Broadcast message',
  discordLabel: 'Discord (text)',
  discordPlaceholder: 'Segment X is starting now!',
  addItem: '+ Add',
  emptyChecklist:
    'No checklist items. The caster will have nothing to check for this segment.',
  labelPlaceholder: 'Label visible to the caster',
  deleteAria: 'Delete',
};
