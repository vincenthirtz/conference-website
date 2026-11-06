// lib/i18n/locales/admin-en/adminTournamentRules.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentRules`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentRules.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  // ── Setting (tournament edit) ──────────────────────────────────────────
  toggleTitle: 'Rules to accept',
  toggleLabel: 'Every member must accept the rules',
  toggleHelp:
    "Every player, substitute and team staff member will have to read the PDF rules all the way down and accept them. Until everyone has, the registration can't be accepted. Off by default; saved with the rest of the form.",

  // ── "Rules" section ───────────────────────────────────────────────────
  sectionTitle: 'Rules (mandatory reading)',
  sectionIntro:
    'The PDF members read in the reader of their space before accepting. Older versions are kept. It does not replace the public "Rules" link of the Visuals panel.',
  requiredOff:
    'The setting is off for this tournament: uploaded versions stay readable, nobody has to accept them.',
  requiredNoVersion:
    'Upload the rules: as long as no version is online, nobody can accept them and no registration can be accepted.',
  loading: 'Reading the rules…',
  loadError: "We couldn't read the rules of this tournament.",
  refresh: 'Refresh',

  uploadTitle: 'Upload a version',
  fileLabel: 'PDF file (15 MB max.)',
  importantLabel: 'Major change: everyone has to accept again',
  importantHelp:
    'Unticked: minor fix (typo, layout) — acceptances already given still count.',
  noteLabel: 'What changes (shown to members)',
  notePlaceholder: 'E.g.: section 4 — play-offs become BO5.',
  noteCount: '{count}/500',
  submit: 'Upload the version',
  submitting: 'Uploading…',
  errorPdfOnly: 'Only PDF files are accepted.',
  errorNotPdf: 'This file is not a valid PDF.',
  errorTooLarge: 'File too large: 15 MB max.',
  errorNoFile: 'Choose a PDF file first.',
  errorUpload: "The version couldn't be uploaded. Try again.",
  uploadedImportant:
    'Version {number} uploaded. Members of engaged teams have to accept it again; they are notified on the site.',
  uploadedMinor:
    'Version {number} uploaded. Acceptances already given still count.',
  uploadedNoNumber: 'Version uploaded.',

  versionsTitle: 'Uploaded versions',
  versionsEmpty: 'No version uploaded.',
  versionLabel: 'Version {number}',
  versionCurrent: 'Current',
  versionImportant: 'Major change',
  versionMinor: 'Fix',
  versionMeta: 'Uploaded on {date}',
  versionMetaBy: 'Uploaded on {date} by {by}',
  download: 'Download',
  downloadLabel: 'Download version {number}',

  validationsTitle: 'Acceptances by team',
  validationsEmpty: 'No engaged or applying team yet.',
  validationsLoadError: "We couldn't read the acceptances.",
  teamCount: '{validated}/{total} acceptances',
  teamComplete: 'Complete',
  teamIncomplete: 'Incomplete',
  missingTitle: 'Missing ({count})',
  memberAccepted: 'accepted on {date}',
  memberPending: 'not accepted yet',
  memberNoAccount: 'no account: cannot accept',

  // ── "Rules X/Y" chip (hub, requests) ───────────────────────────────────
  chipLabel: 'Rules {validated}/{total}',
  chipNoVersion: 'Rules not uploaded',
  chipTitleComplete: 'Every member has accepted the rules.',
  chipTitleIncomplete: 'Missing acceptances: {names}',

  // ── Blocking a registration acceptance ────────────────────────────────
  gateTitle: 'Tournament rules',
  gateNoVersion:
    'Approval blocked: the rules are not uploaded yet (Tournament edit › Rules).',
  gateIncomplete:
    'Approval blocked: rules accepted by {validated}/{total} members.',
  gateMissing: 'Missing: {names}',
  gateComplete: 'Rules accepted by every member ({validated}/{total}).',
  blockedGeneric: 'Refused: not every team member has accepted the rules yet.',
  blockedList:
    'Refused: not every member has accepted the rules yet — {teams}.',
  blockedTeam_one: '{team}: {missing} acceptance missing',
  blockedTeam_other: '{team}: {missing} acceptances missing',

  roles: {
    player: 'player',
    substitute: 'substitute',
    captain: 'captain',
    coach: 'coach',
    manager: 'manager',
  },
};
