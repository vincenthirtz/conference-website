// lib/i18n/locales/en/timeline2026.ts
//
// Traductions ANGLAISES du namespace `timeline2026`.
//
// La SOURCE DE VERITE est le francais (`../fr/timeline2026.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroEyebrow: '2026 roadmap',
  heroTitle: 'Every step on the road to the 2026 finals',
  heroSubtitle:
    'The full run of the season: every matchday, its dates and its fixtures. Updated with every result.',
  item1Title: 'International Day Against Transphobia',
  item1Period: 'May 2026',
  item1Desc:
    'On 17 May we speak up on the official Twitch channel: panel talk, testimonies and a charity showmatch to support the trans community in esports.',
  item1Badge: 'May 17',
  item2Title: 'Summer — Event prep',
  item2Period: 'June 2026',
  item2Desc:
    "Rolling announcements, staff recruitment, partnerships and teasers for October's flagship women's event.",
  followTwitch: 'Follow on Twitch ↗',
  registerTeam: 'Register my team ↗',
  calEyebrow: "2026 women's tournament",
  calTitle: 'Match schedule',
  calSubtitle:
    "Every game of the women's edition, updated in real time. Click a match to open its detailed page.",
  viewAllTournament: 'View all matches ↗',
  viewStandings: 'Standings ↗',

  phasePreseason: 'Pre-season',
  phasePreseasonWhen: 'May → August 2026',
  phaseFinals: 'Finals',
  roundUnnamed: 'Matchday',
  roundNext: 'Next up',
  roundLive: 'Live',
  roundDone: 'Played',
  roundUpcoming: 'Upcoming',
  roundProgress: '{played}/{total} played',
  countdownValue: 'D-{n}',
  countdownLabel: 'until {round}',
  statTeams: 'teams entered',
  statRounds: 'dates on the schedule',
  phaseNoteRounds:
    '{rounds} matchdays, {perRound} matches each, {format}. Every team faces every other one once.',
  phaseNoteSingle: 'Played as {format}.',
  statMatches: 'matches played',
  statMatchesValue: '{played}/{total}',
  statWindow: 'season window',
  emptyTitle:
    "The 2026 women's tournament schedule will be published as soon as registration closes.",
  emptySub: 'Come back soon or join the Discord to be notified.',
  teamFallback1: 'Team 1',
  teamFallback2: 'Team 2',
  bye: '(bye)',
  vs: 'vs',
  statusUpcoming: 'Upcoming',
  statusOngoing: 'Live',
  statusFinished: 'Finished',
  dateTbd: 'Date to be confirmed',
  timeTbd: 'Time to be confirmed',
  match_one: '{count} match',
  match_other: '{count} matches',
};
