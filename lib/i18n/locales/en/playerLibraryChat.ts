// lib/i18n/locales/en/playerLibraryChat.ts
//
// Traductions ANGLAISES du namespace `playerLibraryChat`.
//
// La SOURCE DE VÉRITÉ est le français (`../fr/playerLibraryChat.ts`) : toute clé ajoutée
// là-bas doit l'être ici avec exactement la même structure.
// Même règle qu'en français : un refus du filtre ne dit jamais quel mot a été
// reconnu.

export default {
  title: 'Room chat',
  feedLabel: 'Room messages',
  loading: 'Loading messages…',
  loadError: 'Messages could not be loaded.',
  retry: 'Try again',
  empty: 'No messages yet.',
  you: 'you',
  hiddenMessage: 'Message hidden by moderation.',
  plainText:
    'Plain text: links are not clickable, e-mail addresses and phone numbers are masked. No private messages.',
  closedTitle: 'The chat is closed for now',
  closedBody: 'Emotes and phrases are still available.',
  readOnly: 'Only team members write in this HQ.',
  mutedUntil: 'You are muted until {time}.',
  muted: 'You are muted for now.',

  composer: {
    label: 'Your message',
    placeholder: 'Write to the room…',
    send: 'Send',
    sending: 'Sending…',
    counter: '{count} / {max}',
    counterLabel: '{count} characters out of {max}',
    tooLong: 'Your message is longer than {max} characters.',
    masked: 'Contact details (e-mail or phone) were masked in your message.',
  },

  errors: {
    chat_disabled: 'The chat has just been closed. Emotes are still available.',
    chat_silent_room: 'The Great Reading Room is a silent room.',
    chat_read_only: 'Only team members write in this HQ.',
    chat_muted: 'You are muted for now.',
    chat_too_fast: 'Slow down: wait {seconds} s before your next message.',
    chat_duplicate: 'You just sent this message.',
    chat_empty: 'Your message is empty.',
    chat_too_long: 'Your message is longer than {max} characters.',
    chat_filtered:
      'This message is not allowed: it contains an insult or a slur. Please rephrase it.',
    message_not_found: 'This message no longer exists.',
    chat_moderation_forbidden: 'You cannot moderate this chat.',
    cannot_mute_self: 'You cannot mute yourself.',
    cannot_report_own_message: 'You cannot report your own message.',
    player_not_found: 'This player is no longer in the Library.',
    report_failed:
      'Your report could not be saved. Try again, or write to the team from the Support page.',
    room_closed: 'You no longer have access to this room.',
    library_banned: 'Your access to the Women’s Library is suspended.',
    rate_limited: 'Too many requests at once. Wait a moment, then try again.',
    generic: 'That didn’t work. Try again in a moment.',
  },

  actions: {
    open: 'Actions for the message from {nickname}',
    report: 'Report this message',
    hide: 'Hide for everyone',
    mute: 'Mute',
  },
  hide: {
    title: 'Hide this message?',
    body: 'It disappears for everyone in the room. A copy remains in a report if there is one.',
    confirm: 'Hide',
    pending: 'Hiding…',
    done: 'Message hidden.',
  },
  mute: {
    title: 'Mute {nickname}',
    body: 'She will not be able to write in this room for:',
    durations: {
      min30: '30 minutes',
      hour1: '1 hour',
      hours24: '24 hours',
    },
    confirm: 'Mute',
    pending: 'Muting…',
    done: '{nickname} is muted until {time}.',
  },
  report: {
    title: 'Report a message from {nickname}',
    intro:
      'The message and the 10 before it are copied into your report: the evidence stays, even after the chat is erased (30 days).',
    reasonLegend: 'Reason',
    reasons: {
      harassment: 'Harassment, threats, persistence',
      hate: 'Hate speech',
      personal_info: 'Contact details or personal information shared',
      minor: 'Presumed minor',
      other: 'Other',
    },
    detailsLabel: 'Details (optional)',
    counter: '{count} / {max} characters',
    confidential: 'The reported person will never know who reported her.',
    submit: 'Send report',
    submitting: 'Sending…',
    successTitle: 'Thank you, it has been sent',
    reference: 'Reference: {reference}',
  },
  cancel: 'Cancel',
  close: 'Close',
};
