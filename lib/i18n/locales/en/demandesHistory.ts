// lib/i18n/locales/en/demandesHistory.ts
//
// Traductions ANGLAISES du namespace `demandesHistory`.
//
// La SOURCE DE VERITE est le francais (`../fr/demandesHistory.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Request history',
  cancel: 'Cancel',
  cancelError: 'Error',
  badgeNew: 'New',
  reasonLabel: 'Reason: {note}',
  typeLabels: {
    captain_request: 'Captain request',
    join: 'Join a team',
    leave: 'Leave the team',
    other: 'Request',
  },
  statusLabels: {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Declined',
    cancelled: 'Cancelled',
  },
  cancelConfirmTitle: 'Cancel this request?',
  cancelConfirmSubtitle:
    'The request will be permanently removed. You can create a new one later.',
  cancelConfirmYes: 'Yes, cancel',
  cancelConfirmNo: 'Keep',
};
