// lib/i18n/locales/admin-en/adminDirectorCasterStatusPanel.ts
//
// Traductions ANGLAISES du namespace admin `adminDirectorCasterStatusPanel`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDirectorCasterStatusPanel.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  unknown: 'unknown',
  statusOnline: 'Online',
  statusIdle: 'Idle',
  statusOffline: 'Offline',
  statusUnknown: 'Not connected',
  tooltipNotConnected: 'Not connected yet',
  tooltipLastPing: 'Last ping: {ago} ago',
  tooltipIdle: 'Idle for {ago}',
  tooltipOffline: 'Offline for {ago}',
  errLoading: 'Loading error.',
  errPresence: 'Presence error.',
  heading: 'Casters',
  onlineAria: '{online} casters online out of {total}',
  refreshTitle: 'Refresh',
  refreshAria: 'Refresh casters',
  noMatchSegment: 'No match-type segment in this run.',
  noCaster: "No caster assigned to the run's matches.",
  casterUnknown: 'Unknown caster',
  brief: 'brief:',
  ack: 'ack:',
  ackPending: 'pending',
  ackYes: 'Ack',
  ackNo: 'No ack',
  ackUnavailable: 'Ack unavailable',
  statusAria: 'Status: {label}. {tooltip}',
};
