// lib/i18n/locales/en/playerLibraryHall.ts
//
// Traductions ANGLAISES du namespace `playerLibraryHall`.
//
// La SOURCE DE VÉRITÉ est le français (`../fr/playerLibraryHall.ts`) : toute clé ajoutée
// là-bas doit l'être ici avec exactement la même structure.

export default {
  places: {
    navLabel: 'Places',
    apartment: 'My apartment',
    hall: 'Hall',
    readingRoom: 'Great reading room',
    teamHq: 'My team HQ',
  },

  placeScreen: {
    loading: 'Opening the place…',
    error: 'This place could not be opened.',
    retry: 'Try again',
  },

  spots: {
    board: 'Notice board',
    readingRoom: 'Door to the great reading room',
    apartments: 'Door to the apartments',
    teamHq: 'Door to the team HQs',
    hall: 'Door to the hall',
    shelf: 'Bookshelf',
    guichet: 'Help desk',
  },

  board: {
    title: 'Notice board',
    intro:
      'The latest announcements from the association, posted on Discord or on the site.',
    loading: 'Reading the announcements…',
    error: 'The announcements could not be loaded.',
    retry: 'Try again',
    empty: 'No announcements yet.',
    read: 'Read',
    readAria: 'Read the announcement “{title}”',
    publishedOn: 'Posted on {date}',
    back: 'All announcements',
    truncated: 'The rest of this announcement is on the site.',
    readOnSite: 'Read on the site',
    articleLoading: 'Laying out the announcement…',
  },

  doors: {
    title: 'The hall doors',
    readingRoom: 'Great reading room',
    readingRoomHint:
      'A quiet place: you enter unseen, and nobody knows who is there.',
    apartments: 'Open apartments',
    apartmentsHint: 'Apartments whose owners chose to be listed in the hall.',
    teamHq: 'My team HQ',
    teamHqHint: 'The HQ of the teams you belong to.',
    enter: 'Enter',
    open: 'See the list',
    openTeamHq: 'Choose an HQ',
  },

  apartments: {
    title: 'Open apartments',
    intro: 'Only apartments whose owners chose to be listed here.',
    loading: 'Loading the list…',
    error: 'The list could not be loaded.',
    retry: 'Try again',
    empty: 'No open apartments yet.',
    defaultName: '{nickname}’s apartment',
    owner: 'Hosted by {nickname}',
    visit: 'Enter',
    visitAria: 'Enter “{name}”',
    more: 'Show more',
    loadingMore: 'Loading…',
  },

  settings: {
    listedOn: 'Your apartment is listed in the hall.',
    seeHall: 'Go to the hall',
  },

  dialog: {
    close: 'Close',
  },
};
