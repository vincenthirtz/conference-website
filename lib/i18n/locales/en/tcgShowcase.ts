// lib/i18n/locales/en/tcgShowcase.ts
//
// Traductions ANGLAISES du namespace `tcgShowcase`.
// La SOURCE DE VERITE est le francais (`../fr/tcgShowcase.ts`) : toute cle
// ajoutee la-bas doit l'etre ici (garde-fou : `locales/parity.ts`).

export default {
  publicTitle: 'TCG showcase',
  publicIntro: 'The cards she chose to show.',

  editorTitle: 'My showcase',
  editorIntro:
    'Pick up to {max} cards from your collection to show on your public profile. Nothing is displayed until you turn the showcase on, and the rest of your collection stays private.',
  consentNote:
    'Player photos follow their consent: if one of them withdraws hers, your showcase shows her avatar instead.',
  toggleLabel: 'Show my showcase on my public profile',
  statusOn: 'Visible on your public profile.',
  statusOff: 'Turned off: nothing is displayed.',
  viewProfile: 'View my public profile',
  noProfile:
    'Your public profile will appear once you are on a roster or in the standings: your showcase will be displayed there.',

  chosenTitle: 'Chosen cards ({count} of {max})',
  chosenEmpty: 'No card chosen yet.',
  remove: 'Remove {name} from the showcase',
  unnamed: 'Unnamed card',
  unavailable_one:
    'A chosen card is no longer in your collection: it is no longer displayed.',
  unavailable_other:
    '{count} chosen cards are no longer in your collection: they are no longer displayed.',

  chooseOpen: 'Choose cards',
  chooseClose: 'Close selection',
  chooserLegend: 'Select up to {max} cards',
  chooserLimit: 'You have chosen {max} cards: remove one to select another.',
  chooserEmpty: 'Your collection is empty: open a pack to get cards to show.',
  chooserLoading: 'Loading your collection…',
  chooserError: 'Your collection cannot be loaded.',
  kindPlayer: 'Player',
  kindTeam: 'Team',
  kindMap: 'Map',
  kindFanart: 'Fan art',
  kindMascot: 'Mascot',

  save: 'Save showcase',
  saving: 'Saving…',
  saved: 'Showcase saved.',
  savedOff: 'Showcase removed from your public profile.',
  errNotOwned: 'One of the chosen cards is no longer in your collection.',
  errGeneric: 'Could not save. Try again in a moment.',
  loadError: 'Your showcase cannot be loaded right now.',
  retry: 'Try again',
};
