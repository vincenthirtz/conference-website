// lib/i18n/locales/admin-en/adminMatchCastAssignments.ts
//
// Traductions ANGLAISES du namespace admin `adminMatchCastAssignments`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminMatchCastAssignments.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  loadError: 'Unable to load assigned casts',
  chooseError: 'Choose a caster and a briefing time.',
  assigned: 'Caster assigned',
  genericError: 'Failed',
  confirmRemove: 'Remove this caster from the match?',
  assignmentDeleted: 'Assignment deleted',
  rescheduled: 'Briefing rescheduled (reminder resent)',
  heading: 'Cast',
  headingDesc:
    'The Discord bot will send a reminder DM to each caster ~30 min before their briefing time.',
  loading: 'Loading…',
  empty: 'No caster assigned.',
  unknownCaster: 'Unknown caster',
  briefingLabel: 'Briefing: {time}',
  dmSent: 'DM sent {time}',
  notLinkedWarning: '⚠️ Caster not linked to an account → no DM possible',
  remove: 'Remove',
  addLabel: 'Add a caster',
  choosePlaceholder: '— Choose —',
  notLinkedSuffix: ' (not linked)',
  assign: 'Assign',
  allAssigned: 'All available casters are already assigned.',
};
