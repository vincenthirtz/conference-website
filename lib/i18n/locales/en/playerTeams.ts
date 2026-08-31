// lib/i18n/locales/en/playerTeams.ts
//
// Traductions ANGLAISES du namespace `playerTeams`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerTeams.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: "Team directory — OW Women's Cup",
  heading: 'Team directory',
  subtitle:
    'Who is looking for a scrim, who is recruiting, and on which slots. Teams whose slots overlap yours come first.',
  mySearchTitle: 'Our scrim search',
  mySearchHelp:
    'Announce concrete slots: the listing expires on its own after the last slot, and matching teams are notified.',
  mySearchActive: 'Listing is live',
  expiresAt: 'Expires on {date}',
  slotsLabel: 'Preferred slots',
  slotsEmpty: 'No slot selected.',
  removeSlot: 'Remove this slot',
  maxSlotsHint: 'Click the slots where your team is available.',
  timezoneNote: 'Slots in your timezone ({tz}).',
  prevWeek: 'Previous week',
  nextWeek: 'Next week',
  weekOf: 'Week of {date}',
  maxReached: '{max} slots maximum.',
  noteLabel: 'Details (optional)',
  notePlaceholder: 'BO3, intermediate level, we want to work on dive…',
  publishCta: 'Publish listing',
  relaunchCta: 'Update listing',
  closeCta: 'Close listing',
  published: 'Listing published.',
  publishedWithMatches:
    'Listing published — {count} matching team(s) notified.',
  closed: 'Listing closed.',
  errorNoSlot: 'Select at least one slot.',
  errorPublish: 'The listing could not be published.',
  errorClose: 'The listing could not be closed.',
  filterAll: 'All',
  filterScrim: 'Looking for a scrim',
  filterLevel: 'At my level',
  filterRecruiting: 'Recruiting',
  searchPlaceholder: 'Search a team…',
  badgeScrim: 'looking for a scrim',
  badgeRecruiting: 'recruiting',
  membersCount: '{count} member(s)',
  ratingLabel: 'rating {rating}',
  commonSlots: '{count} slot(s) in common:',
  proposeCta: 'Propose a scrim',
  joinCta: 'Join',
  viewCta: 'View page',
  empty: 'No team matches this filter.',
  errorLoad: 'The directory could not be loaded.',
  retry: 'Retry',
  responseRate: '{rate}% reply rate',
  matchScore: 'Match {score}',
  matchScoreHelp:
    'Score based on shared slots, level gap, reliability and how recently you played this opponent.',
  commonRhythm: '{count} recurring slot(s) in common',
  reasonCommonSlots: 'shared advertised slots',
  reasonCommonRhythm: 'same weekly habits',
  reasonNoCommonSlots: 'no slot in common',
  reasonSimilarLevel: 'similar level',
  reasonLevelGap: 'large level gap',
  reasonReliable: 'answers proposals',
  reasonSlowToAnswer: 'rarely answers',
  reasonNeverPlayed: 'not played recently',
  reasonPlayedRecently: 'played several times already',
  scoutCta: 'Dossier',
};
