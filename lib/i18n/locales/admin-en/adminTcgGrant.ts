// lib/i18n/locales/admin-en/adminTcgGrant.ts
//
// Traductions ANGLAISES du namespace `adminTcgGrant`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTcgGrant.ts`) : toute
// cle ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans
// quoi le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Meme regle de vocabulaire qu'en francais : une CORRECTION, jamais un achat.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string`.

export default {
  heading: 'Adjust a balance',
  subtitle:
    'Correct a player’s coin balance when it is wrong: a missed reward, a duplicate, a data-entry error. Every adjustment is written to the ledger with its reason and logged. This is not a way to hand out coins — they are earned.',

  playerLabel: 'Player',
  playerHint:
    'Search by display name, BattleTag or email, or paste the account ID as is.',
  searchPlaceholder: 'Display name, BattleTag, email or ID',
  resultsLabel: 'Matching accounts',
  searching: 'Searching…',
  searchMinChars: 'Type at least 2 characters to search.',
  searchNoResult: 'No matching account.',
  searchError: 'Search failed. The account ID can be pasted directly.',
  searchForbidden:
    'Account search is not available to this role: paste the account ID, shown in the address of its profile page.',
  useTypedId: 'Use ID {id}',
  resultTeam: 'Team: {team}',
  selectedId: 'ID: {id}',
  changePlayer: 'Change',
  resultsCount: '{count} account(s) found',

  amountLabel: 'Amount (coins)',
  amountHint:
    'Positive to credit, negative to deduct. Between −{max} and {max}, never 0.',
  amountPreviewCredit: 'Credit of {amount} coin(s)',
  amountPreviewDebit: 'Deduction of {amount} coin(s)',

  reasonLabel: 'Reason',
  reasonHint: 'Required. Read in the staff log: what is corrected, and why.',
  reasonPlaceholder:
    'e.g. 12/09 win not credited (match replayed after being voided)',
  reasonCounter: '{count} / {max}',

  submit: 'Review and apply',
  submitting: 'Applying…',

  errUserRequired: 'Choose the player concerned.',
  errUserInvalid: 'This is not a valid account ID.',
  errAmountRequired: 'Enter an amount.',
  errAmountNotInteger: 'The amount must be a whole number of coins.',
  errAmountZero: 'An adjustment of 0 coins corrects nothing.',
  errAmountTooLarge: 'At most {max} coins per adjustment, either way.',
  errReasonRequired: 'A reason is required.',
  errReasonTooShort: 'Reason too short (at least {min} characters).',
  errReasonTooLong: 'Reason too long (at most {max} characters).',

  confirmTitleCredit: 'Credit {amount} coin(s)?',
  confirmTitleDebit: 'Deduct {amount} coin(s)?',
  confirmSummaryCredit: '+{amount} coin(s) to {name}, reason: “{reason}”',
  confirmSummaryDebit: '−{amount} coin(s) from {name}, reason: “{reason}”',
  confirmAccount: 'Account: {id}',
  confirmLedgerNote:
    'The adjustment is written to the ledger and logged. It cannot be erased: a mistake is fixed with an opposite adjustment.',
  confirmCredit: 'Credit',
  confirmDebit: 'Deduct',

  resultApplied:
    'Adjustment applied to {name}. Resulting balance: {balance} coin(s).',
  resultAppliedNoBalance: 'Adjustment applied to {name}.',
  resultReplayed:
    'This adjustment was already recorded: nothing was applied twice. {name}’s balance: {balance} coin(s).',
  resultReplayedNoBalance:
    'This adjustment was already recorded for {name}: nothing was applied twice.',
  toastApplied: 'Balance adjusted.',

  errInvalidBody:
    'The server rejected the request: check the amount and reason.',
  errUserNotFound: 'This account cannot be found in this space.',
  errInsufficientBalance:
    'Cannot deduct: this player’s balance is lower than the amount deducted.',
  errInsufficientBalanceWithBalance:
    'Cannot deduct: this player only has {balance} coin(s).',
  errBalanceChanged:
    'The balance changed during the deduction (a simultaneous spend). Nothing was applied: retry.',
  errForbidden: 'This role cannot adjust balances.',
  errRateLimited:
    'Too many adjustments in a row. Wait a minute before retrying.',
  errQueued:
    'Connection lost: the adjustment is queued and will be sent on reconnect. Retrying this same submission reuses its key, so it is never applied twice.',
  errNetwork:
    'Network unavailable. Retrying this same submission reuses its key: it will not be applied twice.',
  errUnknown:
    'Unexpected server response. Retrying this same submission reuses its key: if it went through, it will not be applied twice.',
};
