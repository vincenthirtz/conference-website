// lib/i18n/locales/en/playerTournamentRules.ts
//
// ENGLISH counterpart of `../fr/playerTournamentRules.ts`. Same keys, always —
// `../parity.ts` breaks the typecheck otherwise.

export default {
  // ── Reader ─────────────────────────────────────────────────────────────
  pageTitle: 'Rules',
  titleWithTournament: 'Rules · {tournament}',
  loading: 'Loading the rules…',
  loadError:
    "We couldn't read the rules status. Check your connection and try again.",
  retry: 'Try again',
  versionMeta: 'Version {number} · uploaded on {date}',
  versionMetaPages: 'Version {number} · {pages} pages · uploaded on {date}',
  whatChanges: 'What changes in this version',
  importantChange: 'Major change: everyone has to accept again.',
  minorChange: 'Minor fix: acceptances already given still count.',
  teamLine: 'Your team: {team}',
  noVersion: 'The staff has not uploaded the rules of this tournament yet.',
  noVersionRequired:
    "You'll be able to read and accept them as soon as they are online: a notification will let you know.",
  notRequired:
    'This tournament does not ask you to accept the rules: they are here to read.',
  notMember:
    "You're not a member of any team registered for this tournament: you can read the rules without having to accept them.",
  notConcerned:
    "Your role in the team doesn't require accepting the rules: they are here to read.",
  download: 'Download the PDF',
  backToSpace: 'Back to my space',

  zoneLabel: 'Rules, {pages} pages',
  zoneLabelLoading: 'Rules (loading)',
  zoneHelp:
    'Scroll this area with the wheel, your finger or the arrow, Page Down and End keys.',
  pageAlt: 'Page {n} of {total}',
  pageText: 'Text of page {n}',
  pdfLoading: 'Opening the PDF…',
  pdfRendering: 'Laying out: {done} / {total} pages',
  pdfErrorFile:
    "The rules couldn't be downloaded. Check your connection, then try again.",
  pdfErrorPdf:
    "The rules couldn't be displayed. Try again; if it keeps failing, let the staff know.",
  pdfErrorLocked: 'Accepting stays locked until the rules are fully displayed.',
  endMarker: 'End of the rules',

  scrollHint: 'Scroll the rules all the way down to be able to accept them.',
  reachedEnd: 'You reached the end of the rules: you can tick the box.',
  checkboxLabel:
    'I have read the rules and I commit to taking part in this tournament',
  checkboxLockedHint:
    'Box disabled: it unlocks once you have scrolled the rules all the way down.',
  checkboxUnlockedHint: 'Tick the box to be able to accept.',
  accept: 'Accept',
  accepting: 'Saving…',
  acceptError: "Your acceptance couldn't be saved. Try again.",
  outdated:
    'A new version of the rules has just been uploaded: read it before accepting.',
  loadNewVersion: 'Load the new version',

  thanks: 'Thank you, your acceptance is saved',
  acceptedOn: 'Accepted on {date}',
  alreadyAccepted: 'You accepted these rules (version {number}).',
  reread: 'Read the rules again',
  hideReader: 'Hide the rules',

  // ── Banner (dashboard) ─────────────────────────────────────────────────
  bannerTitle: 'The rules of {tournament} are waiting for your acceptance',
  bannerBody:
    'Every member of team {team} has to read them to the end and accept them: until everyone has, the registration stays incomplete.',
  bannerNewVersion: 'New version — {note}',
  bannerCta: 'Read and accept',

  // ── Captain card (team management) ─────────────────────────────────────
  teamTitle: 'Rules: {validated}/{total} acceptances',
  teamTitleShort: 'Tournament rules',
  teamComplete: 'Complete',
  teamIncomplete: 'Incomplete',
  teamIntro:
    'Every player, substitute and team staff member has to read and accept the rules. While one acceptance is missing, the staff cannot accept the registration.',
  teamRegisteredIncomplete:
    "The registration is already accepted, but a member hasn't accepted the rules yet: the staff can see it. Remember to send a reminder.",
  teamBeforeSubmit:
    'This tournament asks every member (players, substitutes, team staff) to read and accept its rules. Once the registration is sent, each of them gets a notification on the site.',
  teamNoVersion:
    "The staff hasn't uploaded the rules yet: nobody can accept them for now.",
  teamLoading: 'Reading acceptances…',
  teamLoadError: "We couldn't read the team's acceptances.",
  teamMembersLabel: 'Members’ acceptances',
  memberAccepted: 'Accepted on {date}',
  memberPending: 'Not accepted yet',
  memberNoAccount: 'No account on the site: cannot accept',
  remind: 'Send a reminder',
  reminding: 'Sending…',
  remindHelp:
    "Sends a notification on the site to members who haven't accepted. At most one reminder every 24 h.",
  remindDone_one: '{count} member reminded.',
  remindDone_other: '{count} members reminded.',
  remindNone: 'Nobody to remind: every member with an account has accepted.',
  remindTooSoon:
    'A reminder was already sent. Next reminder possible on {date}.',
  remindTooSoonNoDate: 'A reminder was already sent less than 24 h ago.',
  remindError: "The reminder couldn't be sent. Try again.",
  selfPending: 'You also have to read and accept the rules.',
  selfCta: 'Read and accept',
  readCta: 'Read the rules',

  roles: {
    player: 'Player',
    substitute: 'Substitute',
    captain: 'Captain',
    coach: 'Coach',
    manager: 'Manager',
  },
};
