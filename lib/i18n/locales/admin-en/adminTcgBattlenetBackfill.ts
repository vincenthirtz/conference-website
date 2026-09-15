// lib/i18n/locales/admin-en/adminTcgBattlenetBackfill.ts
//
// Traductions ANGLAISES du namespace `adminTcgBattlenetBackfill`.
//
// La SOURCE DE VERITE est le francais
// (`../admin-fr/adminTcgBattlenetBackfill.ts`) : toute cle ajoutee la-bas doit
// l'etre ici avec exactement la meme structure, sans quoi le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck.
//
// Meme regle de vocabulaire : une recompense gagnee, jamais un achat.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais.

export default {
  heading: 'Backfill the Battle.net reward',
  subtitle:
    'Players who verified their Battle.net account before the reward existed received nothing. This backfill credits them once, in this space only. A player already rewarded, here or elsewhere, is never rewarded twice.',
  eligible: '{count} verified account(s) attached to this space',
  alreadyRewarded: '{count} already rewarded',
  wouldGrant: '{count} to credit',
  discordDms: '{count} Discord message(s) will be sent',
  discordDmsUnknown: 'Number of Discord messages could not be measured',
  outsideSpace:
    '{count} verified account(s) outside this space (no roster or collection here): not affected',
  reward: '{coins} coins per account, once per lifetime, no pack',
  notReady:
    'The reward is not enabled yet (migration not marked as applied): nothing can be credited.',
  nothingToDo: 'Nothing to backfill.',
  replayHint:
    'Running it again later is safe: only accounts verified or attached in the meantime will be credited.',
  grant: 'Backfill',
  granting: 'Backfilling…',
  confirmTitle: 'Backfill the Battle.net reward?',
  confirmBody:
    '{count} account(s) will receive {coins} coins each, {total} coins in total. The reward is unique: once paid here, it can no longer be paid in another space.',
  confirmDms: '{dms} Discord message(s) will be sent.',
  confirmDmsUnknown: 'The number of Discord messages could not be measured.',
  resultGranted: '{granted} account(s) credited, {already} already rewarded.',
  resultPartial:
    '{granted} account(s) credited, {errors} failed: check the logs before running it again.',
  resultNothing: 'No account credited: {already} already rewarded.',
  loadError: 'Simulation unavailable right now.',
  grantError: 'The backfill failed.',
};
