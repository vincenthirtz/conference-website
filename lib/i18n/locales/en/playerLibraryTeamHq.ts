// lib/i18n/locales/en/playerLibraryTeamHq.ts
//
// Traductions ANGLAISES du namespace `playerLibraryTeamHq`.
//
// La SOURCE DE VÉRITÉ est le français (`../fr/playerLibraryTeamHq.ts`) : toute clé ajoutée
// là-bas doit l'être ici avec exactement la même structure.

export default {
  door: {
    title: 'My team HQ',
    intro:
      'Meet up at your team HQ: the next match, the Discord channel, and a room to decorate together.',
    loading: 'Looking for your teams…',
    error: 'Your teams could not be loaded.',
    retry: 'Try again',
    none: 'You are not on a team yet.',
    joinLink: 'Join a team',
    enter: 'Enter the HQ',
    enterAria: 'Enter the {team} HQ',
    entering: 'Opening…',
    notCreated: 'It opens on your first visit.',
  },

  panel: {
    title: '{team} HQ',
    logoAlt: '{team} logo',
    loading: 'Loading the HQ…',
    error: 'The HQ panel could not be loaded.',
    retry: 'Try again',
    staffNote:
      'You are visiting this HQ as staff: you can come in, but you do not lend furniture here.',
  },

  match: {
    title: 'Next match',
    none: 'No upcoming match for now.',
    versus: '{team} vs {opponent}',
    opponentTbd: 'opponent to be decided',
    whenTbd: 'Date to be set',
    bestOf: 'Best of {n}',
    checkinOpen: 'Check-in is open: check in from your dashboard.',
    checkinDone: 'Checked in.',
    checkinSoon: 'Check-in opens on {date}.',
    dashboardLink: 'My dashboard',
    streamLink: 'Watch the stream',
  },

  discord: {
    title: 'Discord channel',
    open: 'Open the team Discord channel',
    openAria: 'Open the team Discord channel (new tab)',
    none: 'The team has no Discord channel yet.',
  },

  furniture: {
    title: 'Furniture lent to the HQ',
    empty: 'No furniture yet: every member can lend her own.',
    count_one: '{count} piece',
    count_other: '{count} pieces',
    lentByMe: 'Lent by you',
    lentBy: 'Lent by {nickname}',
    lentByUnknown: 'Lent by a member',
    position: 'Tile {gx}, {gy}',
    move: 'Move',
    moveAria: 'Move {name}',
    takeBack: 'Take back',
    takeBackAria: 'Take back {name}',
    giveBack: 'Return',
    giveBackAria: 'Return {name} to its owner',
    lendTitle: 'Lend a piece',
    lendIntro:
      'A lent piece stays yours: take it back whenever you like, and it comes back to you if you leave the team.',
    lendEmpty:
      'All your furniture is already placed. Store a piece at home to lend it to the HQ.',
    lend: 'Lend',
    lendAria: 'Lend {name} to the HQ',
    lendPlaced: 'It goes to the first free spot; you can move it afterwards.',
    working: 'One moment…',
    refresh: 'See the updated HQ',
    changed:
      'The HQ has changed: refresh the room to see the furniture in place.',
    done: {
      lent: '{name} is lent to the HQ.',
      moved: '{name} has been moved.',
      returned: '{name} went back to its owner.',
    },
  },

  move: {
    title: 'Move {name}',
    gx: 'Column (0 to {max})',
    gy: 'Row (0 to {max})',
    rotation: 'Facing',
    rotations: {
      r0: 'Towards the back',
      r1: 'Quarter turn',
      r2: 'Half turn',
      r3: 'Three-quarter turn',
    },
    valid: 'It fits here.',
    unknown: 'This piece cannot be placed.',
    submit: 'Place here',
    cancel: 'Cancel',
  },

  codes: {
    room_forbidden: 'This HQ is only open to team members.',
    room_not_found: 'This HQ no longer exists.',
    team_not_found: 'This team no longer exists.',
    team_hq_members_only: 'Only team members lend furniture to its HQ.',
    team_hq_no_space:
      'No free spot left for this piece: move or take back a piece first.',
    team_hq_full: 'The HQ is full: take back a piece before lending another.',
    item_not_lent: 'This piece is no longer lent to the HQ.',
    return_forbidden:
      'Only its owner, the captain and the managers can return this piece.',
    item_placed_elsewhere:
      'This piece is placed elsewhere (in your apartment?): store it first.',
    room_conflict: 'The HQ just changed: try again.',
    placement_invalid: 'This piece does not fit there.',
    library_unavailable: 'The Library is temporarily unavailable.',
    generic: 'That did not work. Try again.',
  },
};
