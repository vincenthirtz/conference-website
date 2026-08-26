// lib/i18n/locales/admin-en/adminTournamentCheckinLive.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentCheckinLive`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentCheckinLive.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Live check-in — admin',
  backToAdmin: '← Normal admin view',
  pageTitle: 'Live check-in',
  windowInfo: 'Window [-{past} min, +{future} min] · poll {poll}s',
  nowLabel: 'Now: {time}',
  lastNudgeLabel: 'Last nudge: {time}',
  metricMatchesInWindow: 'Matches in window',
  metricTeamsCheckedIn: 'Teams checked in',
  metricCompleteMatches: 'Complete matches',
  metricNextMatch: 'Next match',
  tMinusMin: 'T-{n} min',
  tPlusMin: 'T+{n} min',
  loading: 'Loading…',
  emptyWindow: 'No matches in the current window.',
  nudgingShort: 'Nudging…',
  nudgeBoth: 'Nudge both',
  teamSide: 'Team {side}',
  checkedInRelative: '✓ Checked in {relative}',
  notCheckedIn: '⏳ Not checked in yet',
  nudgeDiscord: 'Nudge on Discord',
  relativeNow: 'just now',
  relativeMinutes: '{n} min ago',
  relativeHours: '{n}h ago',
  errorLoad: 'Loading error',
  nudgeNone: 'No team to nudge.',
  nudgeSent_one: 'Nudge sent to {count} captain.',
  nudgeSent_other: 'Nudge sent to {count} captains.',
  nudgeError: 'Nudge failed',
};
