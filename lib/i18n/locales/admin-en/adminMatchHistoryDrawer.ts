// lib/i18n/locales/admin-en/adminMatchHistoryDrawer.ts
//
// Traductions ANGLAISES du namespace admin `adminMatchHistoryDrawer`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminMatchHistoryDrawer.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errorHistory: 'History error',
  close: 'Close',
  kicker: 'Admin · History',
  title: 'Match history',
  loading: 'Loading…',
  empty: 'No staff action recorded on this match.',
  unknownStaff: 'Unknown staff',
  changeReason: 'Reason: {reason}',
  changeDecision: 'Decision: {resolution}',
  changeCancelled: 'Cancelled',
  changeHardDelete: 'DB deletion',
  fieldSchedule: 'schedule',
  fieldStatus: 'status',
  fieldNotes: 'notes',
  fieldLobby: 'lobby',
  fieldReplay: 'replay',
};
