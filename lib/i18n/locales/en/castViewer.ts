// lib/i18n/locales/en/castViewer.ts
//
// Traductions ANGLAISES du namespace `castViewer`.
//
// La SOURCE DE VERITE est le francais (`../fr/castViewer.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusUpcoming: 'UPCOMING',
  statusOngoing: 'ONGOING',
  statusFinished: 'FINISHED',
  statusWalkover: 'WALKOVER',
  docTitle: 'Cast — {team1} vs {team2}',
  errorTitle: 'Error',
  urlInvalidHttp: 'Invalid URL (http/https required)',
  urlInvalid: 'Invalid URL',
  errorGeneric: 'Error',
  replaySaved: 'Replay saved.',
  casterConnected: 'Caster connected',
  autoRefresh: 'Auto-refresh ({seconds}s)',
  updatedLabel: 'Updated',
  lobbyCode: 'Lobby code',
  copyHint: 'Click to copy',
  undefinedValue: 'not set',
  copied: 'copied ✓',
  streamLink: '↗ Stream',
  rosters: 'Rosters',
  veto: 'Veto',
  stepProgress: 'Step {current} / {total}',
  vetoComplete: '✓ done',
  mapsInPlay: 'Maps in play',
  decider: 'Decider',
  headToHead: 'Head-to-head',
  noPreviousMatch: 'No previous encounter.',
  matchCount_one: '{count} match',
  matchCount_other: '{count} matches',
  lastMeetings: 'Last encounters',
  notes: 'Notes',
  replayVod: 'Replay / VOD',
  openCurrentReplay: 'Open the current replay ↗',
  saving: 'Saving…',
  save: 'Save',
  replayHint:
    'Paste the YouTube or Twitch link of the post-match VOD here. It will be displayed publicly on the match page.',
  noRoster: 'No roster',
  sub: 'sub',
  captain: 'Captain',
  manager: 'Manager',
  auto: 'Auto',
};
