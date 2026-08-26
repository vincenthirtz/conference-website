// lib/i18n/locales/admin-en/adminDirectorCueFeed.ts
//
// Traductions ANGLAISES du namespace admin `adminDirectorCueFeed`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDirectorCueFeed.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  relativeNow: 'just now',
  relativeSeconds: '{n}s ago',
  relativeMinutes: '{n}min ago',
  relativeHours: '{n}h ago',
  relativeDays: '{n}d ago',
  errLoading: 'Error loading cues.',
  refreshTitle: 'Refresh',
  refreshAria: 'Refresh cues',
  listAria: 'List of sent cues',
  noCues: 'No cue sent for this run.',
  ackLabel: 'Ack',
  noCasterAssigned: 'No caster assigned to the run.',
  retractAction: 'Retract',
  retractConfirm: 'Retract this cue? Casters will see it cancelled.',
  retractedBadge: 'Cancelled',
  retractSuccess: 'Cue retracted.',
  retractFailed: 'Could not retract the cue.',
  audioBlocked: 'Enable sound',
  audioBlockedHint: "Sound blocked: urgent cues won't play an audio alert.",
};
