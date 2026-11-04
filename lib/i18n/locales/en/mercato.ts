// lib/i18n/locales/en/mercato.ts
//
// Traductions ANGLAISES du namespace `mercato`.
//
// La SOURCE DE VERITE est le francais (`../fr/mercato.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'Transfer market',
  heroTitle: 'The team transfer market',
  heroSubtitle:
    'Players looking for a team and teams that are recruiting, in one place. Filter by role, rank, platform or input — and post your own listing, no account needed.',
  heroNoAccount: 'No account needed',
  heroNoRank: 'No minimum rank',
  heroFree: 'Free',
  tabsLabel: 'Market side',
  tabPlayers: 'Free agents',
  tabTeams: 'Teams recruiting',
  ctaPlayerTitle: 'Looking for a team?',
  ctaPlayerDesc:
    'Post your search: captains see it and reach out. Visible for 60 days.',
  ctaPlayer: 'Post my search',
  ctaTeamTitle: 'Is your team recruiting?',
  ctaTeamDesc:
    'Post your listing: free agents see it and reach out. Visible for 60 days.',
  ctaTeam: 'Post a team listing',
  botTitle: 'From Discord too',
  botDesc:
    'On the server, /mercato joueuse posts or updates your search, and /mercato equipe your team listing — same fields as here.',
  discordCta: 'Join the Discord',

  filtersTitle: 'Filters',
  filterPosition: 'Role',
  filterGender: 'Displayed gender',
  filterGenderHint:
    'Only players who chose to display their gender match this filter.',
  filterSoughtGender: 'Teams looking for',
  filterSoughtGenderHint: 'Mixed teams always match.',
  filterPlatform: 'Platform',
  filterInput: 'Input',
  filterRankMin: 'Minimum rank',
  filterRankMax: 'Maximum rank',
  filterMyRank: 'Your rank',
  filterMyRankHint:
    'Teams whose range (or average rank, within one tier) fits you.',
  filterAny: 'All',
  filterReset: 'Reset filters',
  resultCount: '{shown} shown out of {total}',
  noMatch: 'No listing matches these filters. Widen them, or post your own.',

  posTank: 'Tank',
  posHitscan: 'Hitscan',
  posFlexDps: 'Flex DPS',
  posMainHeal: 'Main heal',
  posFlexSupport: 'Flex support',
  genderFemale: 'Woman',
  genderMale: 'Man',
  genderNonBinary: 'Non-binary',
  genderUndisclosed: 'I prefer not to say',
  soughtFemale: 'Women',
  soughtMale: 'Men',
  soughtNonBinary: 'Non-binary people',
  soughtMixed: 'Mixed',
  platformPc: 'PC',
  platformConsole: 'Console',
  inputController: 'Controller',
  inputMkb: 'Mouse & keyboard',
  tierBronze: 'Bronze',
  tierSilver: 'Silver',
  tierGold: 'Gold',
  tierPlatinum: 'Platinum',
  tierEmerald: 'Emerald',
  tierDiamond: 'Diamond',
  tierMaster: 'Master',
  tierGrandmaster: 'Grandmaster',
  tierChampion: 'Champion',
  rankWithDivision: '{tier} {division}',
  rankAny: 'Any rank',
  rankRange: 'From {min} to {max}',
  rankFrom: '{min} and above',
  rankUpTo: 'Up to {max}',
  rankAverage: 'Average rank: {rank}',

  playerPageTitle: "I'm looking for a team",
  playerPageSubtitle:
    'Your profile appears in the transfer market for 60 days, then expires on its own. No account needed.',
  genderLabel: 'Gender (optional)',
  genderHint:
    'If you fill it in, it is shown on your public profile. Default: “I prefer not to say”, and nothing is shown.',
  rankLabel: 'Your competitive rank',
  rankTierLabel: 'Tier',
  rankDivisionLabel: 'Division',
  rankTierUnknown: "I don't know / I'm new",
  rankDivisionNone: '—',
  rankHint:
    'No minimum rank to play: it only helps suggest teams at your level.',
  platformLabel: 'Platform',
  multiHint: 'Several choices allowed.',
  inputLabel: 'Input',
  mainRoleLabel: 'Main role',
  mainRoleNone: 'Choose…',
  positionsLabel: "Roles you're applying for",
  pastTeamsLabel: 'Past teams, organisations, tryouts',
  pastTeamsPlaceholder:
    'E.g. Team Alpha (2025), tryout with Les Lionnes… (optional)',
  goalsLabel: 'If you join a team, what are you looking for?',
  goalsPlaceholder:
    'Fun, improving, trying to join a big organisation… (optional)',
  wordCount: '{count} / {max} words',
  wordCountOver: '{count} / {max} words — a bit long, please shorten it',
  errorGoals: 'What you are looking for: 50 words maximum.',
  errorPositions: 'Choose at least one role.',

  teamPageTitle: 'My team is recruiting',
  teamPageSubtitle:
    'Your listing appears in the transfer market for 60 days, then expires on its own. No account needed.',
  soughtGendersLabel: 'Who you are looking for',
  soughtGendersHint: 'Several choices allowed. “Mixed”: everyone is welcome.',
  teamRankLabel: 'Average rank wanted',
  teamRankUnknown: 'Any rank',
  teamRankRangeLabel: 'Accepted range (optional)',
  teamRankRangeHint:
    'Leave empty if the average rank is enough. A player within the range sees your listing in her filters.',
  teamRankMin: 'From',
  teamRankMax: 'To',
  teamPlatformLabel: 'Platform(s)',
  teamInputLabel: 'Input(s)',
  anyHint: "Don't tick anything if it doesn't matter.",
  teamPositionsLabel: 'Roles wanted',
  teamNoteLabel: 'Team description and recruiting purpose',
  teamNotePlaceholder:
    'Planned tournament(s)? Building a new team? Looking for a sub? Your vibe, your goals…',
  errorRankRange:
    'The rank range is inverted: the minimum is above the maximum.',

  cardMainRole: 'Main role: {role}',
  cardPastTeams: 'Background',
  cardGoals: "What she's looking for",
  cardSought: 'Looking for: {list}',
  backToHub: 'Back to the transfer market',
};
