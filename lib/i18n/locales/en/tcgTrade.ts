// lib/i18n/locales/en/tcgTrade.ts
//
// Traductions ANGLAISES du namespace `tcgTrade`.
//
// La SOURCE DE VERITE est le francais (`../fr/tcgTrade.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Card trades',
  entryLink: 'Trade cards',
  backToCollection: '← My collection',
  intro:
    'Trade your duplicate cards with other collectors in this space: one card for one card, nothing else.',

  prefTitle: 'Receive trade offers',
  prefStateOn: 'Trading is on.',
  prefStateOff: 'Trading is off.',
  prefWhatItMeans: 'If you turn it on:',
  prefVisible:
    'your username appears in the list of collectors who trade, visible only to those who turned trading on too;',
  prefDoubles:
    'they can see your tradeable duplicates — never the rest of your collection;',
  prefNoMessage: 'an offer only contains cards: no message, no chat;',
  prefOffCancels:
    'you can turn it off at any time: pending offers are then cancelled.',
  prefEnable: 'Turn trading on',
  prefDisable: 'Turn trading off',
  prefSaving: 'Saving…',
  prefOpensOn: 'Trading will open for you on {date}.',
  prefNoCollection:
    'Trading opens once your collection has started: win or buy a first pack.',
  prefToastOn: 'Trading turned on.',
  prefToastOff: 'Trading turned off.',
  prefToastOffCancelled:
    'Trading turned off. {count} pending offer(s) cancelled.',

  rulesTitle: 'The rules',
  rulesParity:
    'Card for card, the same number on each side — up to {max} per trade.',
  rulesNoCoins: 'Never coins or sealed packs: coins are earned, not traded.',
  rulesTradeable:
    'Only cards won in matches, from placements or bought can be traded — not cards from gifts, streaks or drops.',
  rulesDoubles: 'You can only ask for cards she has duplicates of.',
  rulesSets:
    'A card received through a trade doesn’t count towards completing a set: only cards you drew yourself do.',
  rulesExpiry: 'An offer expires after {hours} h.',
  rulesLimits:
    'At most {sent} pending sent offers, and {daily} accepted trades per day.',
  rulesCooldown:
    'After a decline, wait {hours} h before offering to the same person again.',
  rulesAge:
    'You need an account at least {account} days old and a collection at least {collection} days old.',

  composeTitle: 'Offer a trade',
  partnerLabel: 'With whom?',
  partnerPlaceholder: 'Pick a collector',
  partnersEmpty: 'Nobody else has turned trading on in this space yet.',
  theirDoublesTitle: 'Her duplicates — what you ask for',
  theirDoublesEmpty: 'She has no duplicate cards to trade for now.',
  myCardsTitle: 'Your cards — what you offer',
  myCardsEmpty: 'You don’t have any cards yet.',
  notTradeable: 'Not tradeable',
  alreadyPromised: 'Already offered',
  lastCopy: 'Your last copy',
  pickAria: '{name}, {rarity}',
  summary: 'You offer {offered} · you ask for {requested}',
  parityHint: 'Pick the same number of cards on each side.',
  maxHint: 'At most {max} cards on each side.',
  submit: 'Send the offer',
  submitting: 'Sending…',
  proposedToast: 'Offer sent.',
  loading: 'Loading…',

  boxLabel: 'My offers',
  boxReceived: 'Received',
  boxSent: 'Sent',
  stateOpen: 'Pending',
  stateClosed: 'History',
  emptyReceived: 'No pending offers received.',
  emptySent: 'No pending offers sent.',
  emptyClosed: 'Nothing in your history.',
  loadMore: 'Show more',
  loadingMore: 'Loading…',
  listError: 'Could not load offers.',
  retry: 'Try again',

  fromName: 'From {name}',
  toName: 'To {name}',
  unknownName: 'Collector',
  unnamedCard: 'Unnamed card',
  expiresOn: 'Expires on {date}',
  resolvedOn: 'Closed on {date}',
  theyOffer: 'She offers you',
  theyRequest: 'She asks you for',
  youOffer: 'You offer',
  youRequest: 'You ask for',
  youOwn: 'You have {count}',
  youOwnNone: 'You no longer have it',

  statusPending: 'Pending',
  statusAccepted: 'Accepted',
  statusDeclined: 'Declined',
  statusCancelled: 'Cancelled',
  statusExpired: 'Expired',
  reasonOfferedUnavailable: 'An offered card was no longer available.',
  reasonCardUnavailable: 'An offered card went into another trade.',
  reasonTradingDisabled: 'Trading was turned off.',
  reasonProposerCancelled: 'Withdrawn by the sender.',

  accept: 'Accept',
  decline: 'Decline',
  cancel: 'Withdraw',
  working: 'One moment…',
  acceptAria: 'Accept the offer from {name}',
  declineAria: 'Decline the offer from {name}',
  cancelAria: 'Withdraw the offer to {name}',
  confirmAcceptTitle: 'Accept this trade?',
  confirmAcceptBody:
    'You give {give} card(s) and receive {get}. The trade is final.',
  confirmAcceptLastCopy:
    'Careful: you would give away your last copy of at least one card.',
  confirmDeclineTitle: 'Decline this offer?',
  confirmDeclineBody:
    'She will be notified, and won’t be able to offer you a trade again for {hours} h.',
  confirmCancelTitle: 'Withdraw your offer?',
  confirmBack: 'Back',
  toastAccepted: 'Trade accepted: the cards are in your collection.',
  toastDeclined: 'Offer declined.',
  toastCancelled: 'Offer withdrawn.',

  err_generic: 'Something went wrong. Please try again.',
  err_invalid_body: 'Invalid offer.',
  err_invalid_items: 'These cards can’t be traded together.',
  err_self_trade: 'You can’t trade with yourself.',
  err_trading_disabled: 'Turn trading on first.',
  err_collection_too_recent:
    'Your account or collection is still too recent to trade.',
  err_recipient_unavailable: 'This collector isn’t receiving offers.',
  err_recipient_inbox_full:
    'This collector already has too many pending offers.',
  err_too_many_pending: 'You already have too many pending offers.',
  err_already_pending: 'An offer to this collector is already pending.',
  err_recently_declined: 'She declined recently: wait before offering again.',
  err_offered_not_owned: 'One of the offered cards is no longer tradeable.',
  err_requested_not_available:
    'One of the requested cards is no longer a duplicate.',
  err_not_found: 'Offer not found.',
  err_not_pending: 'This offer is already closed.',
  err_expired: 'This offer has expired.',
  err_stale: 'An offered card is no longer available: the offer was cancelled.',
  err_requested_unavailable: 'You no longer own one of the requested cards.',
  err_daily_limit: 'You have reached today’s trade limit.',
  err_partner_daily_limit: 'This collector has reached today’s trade limit.',
  err_not_eligible: 'One of the two accounts is still too recent to trade.',
};
