// lib/i18n/locales/en/playerLibrarySocial.ts
//
// Traductions ANGLAISES du namespace `playerLibrarySocial`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerLibrarySocial.ts`) : toute
// cle ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans
// quoi le garde-fou de compilation `../parity.ts` casse le typecheck.
// Meme regle qu'en francais : rien de ce que lit une personne bloquee ne
// laisse deviner le blocage.

export default {
  emotes: {
    wave: 'Wave',
    clap: 'Clap',
    heart: 'Heart',
    laugh: 'Laugh',
    dance: 'Dance',
  },
  phrases: {
    hello: 'Hi!',
    gg: 'GG',
    play: 'Wanna play?',
    thanks: 'Thanks',
    bye: 'See you',
    welcome: 'Welcome',
  },

  emoteBar: {
    label: 'Emotes and phrases',
    emotesGroup: 'Emotes',
    phrasesGroup: 'Phrases',
    silentRoom: 'Quiet room: no phrases, just a few gentle emotes.',
    disabled: {
      discreet:
        'You are in discreet mode: nobody can see you. Become visible to send a sign.',
      hidden: 'You can’t show yourself in this room right now.',
      offline: 'Connecting to the room…',
    },
    tooFast: 'Easy now: one sign per second.',
  },

  discreet: {
    legend: 'Your presence in the room',
    stay: 'Stay discreet',
    show: 'Be visible',
    explainDiscreet:
      'Nobody can see you. You can see those who chose to be visible.',
    explainVisible:
      'Others can see you and your signs. You can go back to discreet mode at any time.',
    cannotShow: 'You can’t make yourself visible right now.',
  },

  menu: {
    label: 'Actions for {nickname}',
    block: 'Block',
    report: 'Report',
    kick: 'Kick out',
    cancel: 'Cancel',
    close: 'Close',
    blockTitle: 'Block {nickname}?',
    blockBody:
      'You will no longer see each other in the Library, and neither of you will be able to enter the other’s apartment.',
    blockSilent: '{nickname} will not be notified.',
    blockConfirm: 'Block',
    blockPending: 'Blocking…',
    blockDone: '{nickname} is blocked: you will no longer see each other.',
    kickTitle: 'Kick {nickname} out',
    kickBody:
      'She leaves your apartment and can’t come back until the kick ends.',
    kickDuration: 'Duration',
    kickDurations: {
      min30: '30 minutes',
      hour1: '1 hour',
      hours24: '24 hours',
    },
    kickConfirm: 'Kick out',
    kickPending: 'Kicking out…',
    kickDone: '{nickname} is kicked out of your apartment until {until}.',
  },

  report: {
    title: 'Report {nickname}',
    intro: 'Your report goes to the association’s moderation team.',
    reasonLegend: 'Reason',
    reasons: {
      harassment: {
        label: 'Harassment',
        help: 'Insults, threats, pestering, hateful remarks.',
      },
      minor: {
        label: 'Suspected minor',
        help: 'The Library is for adults only: the team will check, and can ban her.',
      },
      impersonation: {
        label: 'Impersonation',
        help: 'She is pretending to be someone else: a player, a streamer, the team.',
      },
      other: {
        label: 'Other',
        help: 'Any other behaviour that makes you uncomfortable.',
      },
    },
    detailsLabel: 'Details (optional)',
    detailsHint:
      'What happened, and when. No need to include your contact details.',
    counter: '{count} / {max} characters',
    confidential: 'The person you report will never know who reported her.',
    safetyLink: 'Resources and help',
    newTab: '(new tab)',
    submit: 'Send report',
    submitting: 'Sending…',
    cancel: 'Cancel',
    close: 'Close',
    successTitle: 'Thank you, it’s been sent',
    successBody: 'The moderation team will read your report.',
    reference: 'Reference: {reference}',
    referenceHint: 'Quote it if you write to the team.',
    blockHint: 'To stop seeing her, you can also block her.',
  },

  notice: {
    kickedTitle: 'You left this apartment',
    kickedBody: 'Its owner asked you to leave. You can come back from {until}.',
    kickedEnterTitle: 'Not just yet',
    kickedEnterUntil: 'You can’t enter this apartment before {until}.',
    kickedEnterLater: 'You can’t enter this apartment right now.',
    bannedTitle: 'Library access suspended',
    bannedUntil:
      'Your access to the Women’s Library is suspended until {until}.',
    bannedBody: 'Your access to the Women’s Library is suspended.',
    bannedHelp: 'Any questions? The team can answer you.',
    supportLink: 'Contact the team',
    closedTitle: 'This room is no longer available',
    forbiddenTitle: 'This room isn’t available',
    elsewhere: 'You can carry on exploring elsewhere in the Library.',
    notFoundTitle: 'Room not found',
    notFoundBody: 'This room doesn’t exist, or no longer exists.',
    connectionTitle: 'Connection lost',
    connectionBody: 'The room stopped responding. Try again in a moment.',
    errorTitle: 'Couldn’t get in',
    errorBody: 'The room couldn’t open. Try again in a moment.',
  },

  room: {
    loading: 'Entering the room…',
    canvasLabel:
      'The room in isometric view. The players present are listed below the view.',
    resetView: 'Recenter the view',
    hint: 'Tap the floor to move, tap a player to block or report her.',
    presentTitle: 'In the room',
    presentCount_one: '{count} other player visible',
    presentCount_other: '{count} other players visible',
    presentEmpty: 'Nobody else is visible right now.',
    presentHint: 'Pick a player to open her actions.',
    discreetMarker: 'discreet',
    backToApartment: 'Back to my apartment',
    retry: 'Try again',
    visiting: 'Visiting',
    names: {
      hall: 'The hall',
      reading_room: 'The Great Reading Room',
      team_hq: 'A team HQ',
      apartment: 'An apartment',
    },
  },

  codes: {
    room_not_found: 'This room doesn’t exist, or no longer exists.',
    room_forbidden: 'This room isn’t available.',
    room_kicked: 'You can’t enter this room right now.',
    player_not_found: 'This player is no longer in the Library.',
    cannot_block_self: 'You can’t block yourself.',
    cannot_report_self: 'You can’t report yourself.',
    cannot_kick_self: 'You can’t kick yourself out of your own place.',
    apartment_not_found:
      'You don’t have an apartment yet, so you can’t kick anyone out.',
    report_failed:
      'Your report couldn’t be saved. Try again, or write to the team from the Support page.',
    rate_limited: 'Too many requests at once. Wait a little, then try again.',
    library_banned: 'Your access to the Women’s Library is suspended.',
    generic: 'That didn’t work. Try again in a moment.',
  },
};
