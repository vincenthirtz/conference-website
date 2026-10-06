// lib/i18n/locales/en/playerMatch.ts — miroir ANGLAIS de ../fr/playerMatch.ts.

export default {
  pageTitle: '{team} vs {opponent}',
  back: 'Back to my matches',
  loading: 'Loading match…',
  loadError: 'This match could not be loaded.',
  notFound: 'This match does not exist, or you are not playing in it.',
  retry: 'Retry',
  signIn: 'Sign in',
  connectPrompt: 'Sign in to follow your match.',
  sessionExpired: 'Your session expired.',
  signinAgain: 'Sign in again',

  vs: 'vs',
  dateTbd: 'Date to be confirmed',
  statusUpcoming: 'Upcoming',
  statusOngoing: 'Live',
  statusFinished: 'Played',
  statusDisputed: 'Disputed',

  stepPrepare: 'Preparation',
  stepCheckin: 'Check-in',
  stepLineup: 'Lineup',
  stepLive: 'During the match',
  stepScore: 'After the match',

  prepareBody:
    'The opponent dossier gathers their results, their usual time slots and what your team noted last time.',
  prepareScouting: 'Open the opponent dossier ↗',
  prepareTeamPage: 'View the team page ↗',
  prepareNoOpponent: 'The opponent is not decided yet.',

  checkinOpensAt: 'Check-in opens on {date}.',
  checkinOpenNow: 'Check-in is open — confirm your team is here.',
  checkinDone: 'Checked in on {date}.',
  checkinMissed: 'The check-in window closed without a confirmation.',
  checkinCta: 'Confirm check-in',
  checkinPending: 'Sending…',
  checkinSuccess: 'Check-in confirmed.',
  checkinAlready: 'Your team was already checked in.',
  checkinFailed: 'Check-in failed.',
  checkinNoToken:
    'Check-in for this match is not handled from the player area.',
  checkinReadOnly: 'Only your captain or staff can confirm.',
  checkinRestricted:
    'Check-in is done by the captain, the coach or the manager.',

  rosterWarning:
    'Your roster is {n} player(s) short of the tournament minimum.',
  rosterOk: 'Your roster meets the tournament minimum.',

  liveWatch: 'Watch the stream ↗',
  liveNoStream: 'No stream announced for this match.',
  liveMatchPage: 'Open the public match page ↗',

  scoreReportCta: 'Report the score',
  scoreEditCta: 'Correct my report',
  scoreNone: 'The score has not been reported yet.',
  scoreAwaitingOpponent:
    'Your report is saved ({mine}–{opponent}). Waiting for the opponent.',
  scoreAwaitingMe: 'The opponent reported the score. Your turn to confirm.',
  scoreAgreed: 'Both teams reported the same score.',
  scoreDisputed:
    'The two reports disagree: staff will arbitrate. You can correct yours.',
  scoreFinal: 'Final score: {mine}–{opponent}.',
  disputeMine: 'Your team reported {mine}–{opponent}.',
  disputeOpponent:
    'The opponent reported {mine}–{opponent} (your score first).',
  disputeOpponentNone: 'The opponent has not reported a score.',
  disputeStaffOpened:
    'Staff opened a dispute on this match: they will set the result.',
  disputeExpectedBy: 'Ruling expected by {date} (target delay: {duration}).',
  disputeOverdue:
    'The target ruling delay ({duration}) has passed: staff are reminded automatically.',
  disputeSlaOnly: 'Target ruling delay: {duration} after the dispute opens.',
  disputeTicketHint:
    'Something to add? Attach a screenshot below, or write to the staff.',
  disputeTicketCta: 'Open a dispute ticket ↗',
  disputeTicketSubject: 'Score dispute — {team} vs {opponent}',
  disputeTicketMessage:
    'Match: {url}\nOur report: {mine}–{opponent}.\n\nWhat we dispute: ',
  durationMinutes: '{n} min',
  durationHours: '{n} h',
  durationHoursMinutes: '{h} h {m} min',
  evidenceTitle: 'Score screenshot',
  evidenceHelp:
    'Attach a screenshot of the end screen (PNG, JPEG or WebP, 4 MB max). It is sent to the staff with your report.',
  evidenceCta: 'Attach a screenshot',
  evidenceUploading: 'Uploading the screenshot…',
  evidenceSuccess: 'Screenshot attached to the match.',
  evidenceSent: 'Screenshot(s) attached from this page: {n}.',
  evidenceErrTooLarge: 'Screenshot too large (4 MB max).',
  evidenceErrType: 'This file is not a PNG, JPEG or WebP image.',
  evidenceErrRight:
    'Only a captain or manager of one of the teams can attach evidence.',
  evidenceErrBothSides:
    'You hold both teams of this match: each team attaches its own evidence.',
  evidenceErrRateLimited: 'Too many uploads. Try again in a minute.',
  evidenceErrSession:
    'Your session expired. Sign in again, then resend the screenshot.',
  evidenceErrGeneric: 'The screenshot could not be sent. Please try again.',
  scoreCaptainOnly: 'Only the captain can report the score.',
  scoreAfterKickoff: 'The score can be reported once the match has kicked off.',
  reviewCta: 'Write the match review ↗',
  reviewBody:
    'A review written while it is fresh beats three memories. It stays in your team memory.',

  prepObjectivesTitle: 'Match goals',
  prepObjectivesHelp:
    'Two or three intentions, written before playing. They open the post-match review: that is where you check whether they held.',
  prepObjectivesPlaceholder:
    'e.g. hold the first point · do not force ultimates · keep comms short',
  prepSave: 'Save',
  prepSaving: 'Saving…',
  prepSaved: 'Goals saved.',
  prepUnsaved: 'Unsaved',
  prepError: 'The goals could not be saved.',
};
