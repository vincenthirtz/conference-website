// lib/i18n/locales/admin-en/adminDashboardConfirmAdvanceModal.ts
//
// Traductions ANGLAISES du namespace admin `adminDashboardConfirmAdvanceModal`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDashboardConfirmAdvanceModal.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  offline: 'Offline: the advancement will be sent on reconnection.',
  unexpectedError: 'Unexpected error',
  title: 'Advance the stage',
  bodyBefore: 'The stage ',
  bodyAfter:
    ' will be advanced automatically according to the configured rules (',
  bodyClose: ').',
  warningBefore:
    'Eligible teams will be added to the target stage and the source stage will be disabled. This action is ',
  warningStrong: 'idempotent',
  warningAfter:
    ' but manual cleanup remains your responsibility if you want to undo it.',
  cancel: 'Cancel',
  advanceNow: '🚀 Advance now',
};
