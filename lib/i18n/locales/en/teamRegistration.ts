// lib/i18n/locales/en/teamRegistration.ts
//
// ENGLISH counterpart of `../fr/teamRegistration.ts`. Same keys, always —
// `../parity.ts` breaks the typecheck otherwise.

export default {
  title: 'Tournament registration',
  loading: 'Reading your registration…',
  loadError:
    "We couldn't read your registration status. Reload the page or contact the staff.",

  registeredTitle: 'Registered for {tournament}',
  registeredDesc:
    'Nothing more to do here: your team is on the list of registered teams.',

  pendingTitle: 'Application sent',
  pendingDesc:
    "The staff still has to approve it. There's no need to send a second one.",

  rejectedNotice:
    'Your previous application was turned down (on {date}). You can send a new one, or talk to the staff first.',

  notRegisteredTitle: 'Your team is not registered for {tournament} yet',
  notRegisteredDesc:
    "The registration attempted when the team was created didn't go through — that happens when the roster isn't complete yet at creation time. Send the application from here whenever you're ready.",

  blockersTitle: "What's left to do",
  blockerNotOpen: 'Registrations for this tournament are currently closed.',
  blockerRosterShortfall:
    'The roster needs at least {min} members (coaches excluded) — you are {count}.',
  blockerTournamentFull: 'The tournament is full: {registered} teams of {max}.',
  blockerNoPermission:
    "Your team role doesn't allow registering the team for a tournament. Ask your captain.",

  rosterCta: 'Complete the roster',
  contactStaffCta: 'Contact the staff',

  messageLabel: 'Message for the staff',
  messageOptional: 'optional',
  messagePlaceholder: 'Anything useful for the review?',

  customFieldsTitle: 'Fields required by the tournament',
  customFieldRequiredMark: '*',
  customFieldRequiredError: 'This field is required.',
  customFieldSelectPlaceholder: 'Choose…',

  submitCta: 'Send the application',
  submitting: 'Sending…',
  submitError: "The application couldn't be sent. Try again.",
  submitSuccess:
    "Application sent. The staff will review it — you'll see the outcome here.",

  readOnlyNote:
    'Inspection: actions are disabled, you see what the captain sees.',
};
