// lib/i18n/locales/en/playerLibraryArena.ts
//
// Traductions ANGLAISES du namespace `playerLibraryArena`.
//
// La SOURCE DE VÉRITÉ est le français (`../fr/playerLibraryArena.ts`) : toute
// clé ajoutée là-bas doit l'être ici avec exactement la même structure.

export default {
  title: 'The arena',
  loading: 'Opening the arena…',
  error: 'The arena could not be opened.',
  retry: 'Try again',
  anonymous: 'A player',
  weekLabel: 'week {n}',

  tabs: {
    label: 'Arena',
    lobby: 'The lounge',
    deck: 'My deck',
  },

  lobby: {
    guardianTitle: 'The arena guardian',
    guardianIntro:
      'She is waiting for a card duel, played with your collection: each card’s level, attack and defence. Nobody loses or wins a card in a duel, and no coins are at stake.',
    weeklyTitle: 'Pack of the week',
    weeklyOpen:
      'Win a duel this week ({week}) to receive a pack — once a week.',
    weeklyClaimed:
      'This week’s pack is already won ({week}). You can keep playing for fun; the next pack can be won from Monday.',
    deckTitle: 'Your deck',
    deckReady: 'Your deck is ready: {count} cards.',
    deckIncomplete: 'Your deck has {count} of {size} cards.',
    deckEdit: 'Build my deck',
    challengesTitle: 'The guardian’s challenges',
    challenges: {
      remparts: {
        name: 'The Ramparts',
        hint: 'Tanks and maps: a defence that holds, and hits back.',
      },
      assaut: {
        name: 'The Assault',
        hint: 'Damage heroes: an attack that hits hard and fast.',
      },
      harmonie: {
        name: 'The Harmony',
        hint: 'Supports and mascots: a balanced game, neither ahead nor behind.',
      },
    },
    profile: 'Profile: {profile}',
    cardCount: '{count} cards',
    challenge: 'Challenge',
    challengeAria: 'Challenge the guardian: {name}',
    needDeck: 'You need a {size}-card deck to challenge the guardian.',
    activeTitle: 'Duel in progress',
    activeBody: 'Your duel against {name} is waiting for you.',
    resume: 'Resume the duel',
    starting: 'The guardian is preparing the duel…',
    historyTitle: 'My duels',
    historyPrivate: 'Only you can see your history. There is no ranking.',
    historyEmpty: 'No finished duel yet.',
    historyLine: 'Turn {turn} · {player} LP vs {npc} LP',
    rewardGranted: 'Pack won',
    rewardWeekAlready: 'Pack already won this week',
  },

  outcome: {
    active: 'In progress',
    won: 'Victory',
    lost: 'Defeat',
    draw: 'Draw',
    abandoned: 'Abandoned',
  },

  reason: {
    lp: 'life points down to zero',
    deck_out: 'deck exhausted',
    turn_limit: '{limit}-turn limit',
    abandon: 'abandoned',
  },

  deck: {
    title: 'My deck',
    intro:
      'Pick {size} cards from your collection (a card as many times as you own copies of it). A deck is only a selection: your cards stay tradeable and recyclable.',
    collectionTitle: 'My collection',
    deckTitle: 'My deck ({count} / {size})',
    filterRarity: 'Rarity',
    filterProfile: 'Profile',
    filterAll: 'All',
    add: 'Add',
    addAria: 'Add {name} to the deck',
    remove: 'Remove',
    removeAria: 'Remove {name} from the deck',
    available: '{count} free of {owned}',
    full: 'Your deck is complete.',
    empty: 'Your deck is empty: add cards from your collection.',
    collectionEmpty: 'No card matches these filters.',
    collectionNone: 'Your collection is empty: open packs in your TCG space.',
    tooFew:
      'Your collection has {count} cards: a deck needs {size}. Win and open packs to complete it.',
    missing: 'no longer in your collection',
    dropped:
      '{count} card(s) of your deck are no longer in your collection and would be left out: {names}.',
    save: 'Save the deck',
    saving: 'Saving…',
    saved: 'Deck saved.',
    saveError: 'The deck could not be saved.',
    notOwned:
      'Some cards are no longer in your collection (or not in that many copies): remove them.',
    back: 'Back to the lounge',
    unsaved: 'Unsaved changes.',
  },

  duel: {
    title: 'Duel against {name}',
    you: 'You',
    guardian: 'The guardian',
    lpAria: '{who}: {lp} life points',
    lp: '{lp} LP',
    deckCount: 'Deck: {count}',
    handCount: 'Hand: {count}',
    graveyard: 'Graveyard: {count}',
    turn: 'Turn {turn} of {limit}',
    yourTurn: 'Your move.',
    guardianTurn: 'The guardian is playing…',
    zone: 'Zone {n}',
    zoneEmpty: 'Zone {n}: empty',
    positions: { attack: 'Attack', defense: 'Defence' },
    hand: 'My hand',
    handEmpty: 'Your hand is empty.',
    field: 'My field',
    guardianField: 'The guardian’s field',
    selectHint:
      'Pick a card from your hand to summon it, or one of your monsters to attack or change its position.',
    cardAria: '{name}, level {level}, attack {attack}, defence {defense}',
    monsterAria:
      '{name}, in {position}, level {level}, attack {attack}, defence {defense}',
    actionsTitle: 'What to do with {name}?',
    summonAs: 'Summon in {position}',
    tributesNeeded: '{count} tribute(s) needed among your monsters:',
    tribute: 'Tribute {name}',
    attack: 'Attack',
    attackTarget: 'Attack {name} ({position}, {value})',
    directAttack: 'Direct attack',
    changePosition: 'Switch to {position}',
    cancel: 'Cancel',
    endTurn: 'End my turn',
    abandon: 'Abandon',
    abandonConfirm: 'Abandon this duel? It counts as a defeat, with no pack.',
    abandonYes: 'Yes, abandon',
    abandonNo: 'Keep playing',
    noAction: 'Nothing to do with this card right now.',
    alreadySummoned: 'You already summoned this turn.',
    firstTurn: 'Nobody attacks on the very first turn of the duel.',
    log: 'Duel log',
    stale: 'The duel moved on elsewhere: it has been reloaded.',
    refused: 'This move is not allowed.',
    error: 'The move could not be sent. Try again.',
    dropped:
      '{count} card(s) of your deck were no longer in your collection and were left out: {names}.',
    skip: 'Skip the animation',
    playing: 'The guardian is playing her turn.',
  },

  events: {
    turnStartYou: 'Turn {turn}: your move.',
    turnStartGuardian: 'Turn {turn}: the guardian plays.',
    drawYou: 'You draw {name}.',
    drawGuardian: 'The guardian draws a card.',
    summonYou: 'You summon {name} in {position}.',
    summonGuardian: 'The guardian summons {name} in {position}.',
    tributes: ' Tribute: {names}.',
    positionYou: '{name} switches to {position}.',
    positionGuardian: 'The guardian’s {name} switches to {position}.',
    attackDirectYou:
      '{attacker} attacks directly: the guardian loses {amount} life points.',
    attackDirectGuardian:
      '{attacker} attacks you directly: you lose {amount} life points.',
    attackWin: '{attacker} ({atk}) destroys {target} ({value}).',
    attackLose: '{attacker} ({atk}) is destroyed by {target} ({value}).',
    attackRebound: '{attacker} ({atk}) hits {target}’s defence ({value}).',
    attackTie:
      '{attacker} ({atk}) and {target} ({value}) are even: nothing happens.',
    damageYou: ' You lose {amount} life points.',
    damageGuardian: ' The guardian loses {amount} life points.',
    end: {
      won: 'Victory! The guardian yields.',
      lost: 'Defeat. The guardian wins.',
      draw: 'Draw: the same life points on both sides.',
      abandoned: 'Duel abandoned.',
    },
  },

  result: {
    title: {
      won: 'Victory!',
      lost: 'Defeat',
      draw: 'Draw',
      abandoned: 'Abandoned',
    },
    reasonLine: 'End of the duel: {reason}.',
    lpLine: 'Life points: you {player}, the guardian {npc}.',
    rewardGranted: 'Pack of the week won! It is waiting with your other packs.',
    rewardOpen: 'Open my packs',
    rewardWeekAlready:
      'This week’s pack is already won ({week}): this victory is for the glory.',
    rewardPending:
      'Your victory is saved; your pack could not be written yet. Reload the duel in a moment.',
    rewardReload: 'Reload',
    rewardNone:
      'No pack for this duel: only a victory earns the pack of the week.',
    again: 'Play again',
    backLobby: 'Back to the lounge',
  },

  errors: {
    duel_active: 'A duel is already in progress: resume it or abandon it.',
    deck_incomplete: 'Your deck must have 20 cards.',
    deck_too_small:
      'Too many cards of your deck have left your collection: rebuild your deck.',
    duel_outdated:
      'This duel follows an older version of the rules: it can only be abandoned.',
    collection_unreadable: 'Your collection could not be read. Try again.',
    duel_not_found: 'This duel does not exist (any more).',
  },
};
