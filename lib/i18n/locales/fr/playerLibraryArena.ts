// lib/i18n/locales/fr/playerLibraryArena.ts
//
// Traductions FRANÇAISES du namespace `playerLibraryArena` — SOURCE DE VÉRITÉ.
// L'arène de la Women's Library, lot 12 de docs/PLAN-tcg-2.md. Toute clé
// ajoutée ici doit l'être aussi côté anglais : le garde-fou de compilation
// `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerLibraryArena', {
  title: 'L’arène',
  loading: 'Ouverture de l’arène…',
  error: 'L’arène n’a pas pu être ouverte.',
  retry: 'Réessayer',
  anonymous: 'Une joueuse',
  weekLabel: 'semaine {n}',

  tabs: {
    label: 'Arène',
    lobby: 'Le salon',
    deck: 'Mon deck',
  },

  lobby: {
    guardianTitle: 'La gardienne de l’arène',
    guardianIntro:
      'Elle t’attend pour un duel de cartes, avec ta collection : niveau, attaque et défense de chaque carte. Personne ne perd ni ne gagne de carte en duel, et aucune pièce n’est mise en jeu.',
    weeklyTitle: 'Paquet de la semaine',
    weeklyOpen:
      'Gagne un duel cette semaine ({week}) : tu reçois un paquet, une seule fois par semaine.',
    weeklyClaimed:
      'Paquet de la semaine déjà gagné ({week}). Tu peux rejouer pour le plaisir ; le prochain paquet se gagne à partir de lundi.',
    deckTitle: 'Ton deck',
    deckReady: 'Ton deck est prêt : {count} cartes.',
    deckIncomplete: 'Ton deck compte {count} cartes sur {size}.',
    deckEdit: 'Construire mon deck',
    challengesTitle: 'Les défis de la gardienne',
    challenges: {
      remparts: {
        name: 'Les Remparts',
        hint: 'Tanks et maps : une défense qui tient, et qui renvoie les coups.',
      },
      assaut: {
        name: 'L’Assaut',
        hint: 'Les héros dégâts : une attaque qui frappe fort et vite.',
      },
      harmonie: {
        name: 'L’Harmonie',
        hint: 'Soutiens et mascottes : un jeu équilibré, ni devant ni derrière.',
      },
    },
    profile: 'Profil : {profile}',
    cardCount: '{count} cartes',
    challenge: 'Défier',
    challengeAria: 'Défier la gardienne : {name}',
    needDeck: 'Il te faut un deck de {size} cartes pour défier la gardienne.',
    activeTitle: 'Duel en cours',
    activeBody: 'Ton duel contre {name} t’attend.',
    resume: 'Reprendre le duel',
    starting: 'La gardienne prépare le duel…',
    historyTitle: 'Mes duels',
    historyPrivate:
      'Ton historique n’est visible que de toi. Il n’y a aucun classement.',
    historyEmpty: 'Aucun duel terminé pour l’instant.',
    historyLine: 'Tour {turn} · {player} PV contre {npc} PV',
    rewardGranted: 'Paquet gagné',
    rewardWeekAlready: 'Paquet déjà gagné cette semaine',
  },

  outcome: {
    active: 'En cours',
    won: 'Victoire',
    lost: 'Défaite',
    draw: 'Match nul',
    abandoned: 'Abandon',
  },

  reason: {
    lp: 'points de vie à zéro',
    deck_out: 'deck épuisé',
    turn_limit: 'limite de {limit} tours',
    abandon: 'abandon',
  },

  deck: {
    title: 'Mon deck',
    intro:
      'Choisis {size} cartes de ta collection (une carte autant de fois que tu en possèdes d’exemplaires). Un deck n’est qu’une sélection : tes cartes restent échangeables et recyclables.',
    collectionTitle: 'Ma collection',
    deckTitle: 'Mon deck ({count} / {size})',
    filterRarity: 'Rareté',
    filterProfile: 'Profil',
    filterAll: 'Toutes',
    add: 'Ajouter',
    addAria: 'Ajouter {name} au deck',
    remove: 'Retirer',
    removeAria: 'Retirer {name} du deck',
    available: '{count} libre(s) sur {owned}',
    full: 'Ton deck est complet.',
    empty: 'Ton deck est vide : ajoute des cartes depuis ta collection.',
    collectionEmpty: 'Aucune carte ne correspond à ces filtres.',
    collectionNone:
      'Ta collection est vide : ouvre des paquets dans ton espace TCG.',
    tooFew:
      'Ta collection compte {count} cartes : il en faut {size} pour un deck. Gagne et ouvre des paquets pour compléter.',
    missing: 'plus dans ta collection',
    dropped:
      '{count} carte(s) de ton deck ne sont plus dans ta collection et seraient écartées : {names}.',
    save: 'Enregistrer le deck',
    saving: 'Enregistrement…',
    saved: 'Deck enregistré.',
    saveError: 'Le deck n’a pas pu être enregistré.',
    notOwned:
      'Certaines cartes ne sont plus dans ta collection (ou pas en autant d’exemplaires) : retire-les.',
    back: 'Retour au salon',
    unsaved: 'Modifications non enregistrées.',
  },

  duel: {
    title: 'Duel contre {name}',
    you: 'Toi',
    guardian: 'La gardienne',
    lpAria: '{who} : {lp} points de vie',
    lp: '{lp} PV',
    deckCount: 'Deck : {count}',
    handCount: 'Main : {count}',
    graveyard: 'Cimetière : {count}',
    turn: 'Tour {turn} sur {limit}',
    yourTurn: 'À toi de jouer.',
    guardianTurn: 'La gardienne joue…',
    zone: 'Zone {n}',
    zoneEmpty: 'Zone {n} : vide',
    positions: { attack: 'Attaque', defense: 'Défense' },
    hand: 'Ma main',
    handEmpty: 'Ta main est vide.',
    field: 'Mon terrain',
    guardianField: 'Terrain de la gardienne',
    selectHint:
      'Choisis une carte de ta main pour l’invoquer, ou un de tes monstres pour attaquer ou changer sa position.',
    cardAria: '{name}, niveau {level}, attaque {attack}, défense {defense}',
    monsterAria:
      '{name}, en {position}, niveau {level}, attaque {attack}, défense {defense}',
    actionsTitle: 'Que faire avec {name} ?',
    summonAs: 'Invoquer en {position}',
    tributesNeeded: 'Il faut {count} sacrifice(s) parmi tes monstres :',
    tribute: 'Sacrifier {name}',
    attack: 'Attaquer',
    attackTarget: 'Attaquer {name} ({position}, {value})',
    directAttack: 'Attaque directe',
    changePosition: 'Passer en {position}',
    cancel: 'Annuler',
    endTurn: 'Finir mon tour',
    abandon: 'Abandonner',
    abandonConfirm: 'Abandonner ce duel ? C’est une défaite, sans paquet.',
    abandonYes: 'Oui, abandonner',
    abandonNo: 'Continuer le duel',
    noAction: 'Rien à faire avec cette carte pour l’instant.',
    alreadySummoned: 'Tu as déjà invoqué ce tour-ci.',
    firstTurn: 'Personne n’attaque au premier tour du duel.',
    log: 'Journal du duel',
    stale: 'Le duel a avancé ailleurs : il a été rechargé.',
    refused: 'Ce geste n’est pas permis.',
    error: 'Le geste n’a pas pu être envoyé. Réessaie.',
    dropped:
      '{count} carte(s) de ton deck n’étaient plus dans ta collection et ont été écartées : {names}.',
    skip: 'Passer l’animation',
    playing: 'La gardienne joue son tour.',
  },

  events: {
    turnStartYou: 'Tour {turn} : à toi.',
    turnStartGuardian: 'Tour {turn} : la gardienne joue.',
    drawYou: 'Tu pioches {name}.',
    drawGuardian: 'La gardienne pioche une carte.',
    summonYou: 'Tu invoques {name} en {position}.',
    summonGuardian: 'La gardienne invoque {name} en {position}.',
    tributes: ' Sacrifice : {names}.',
    positionYou: '{name} passe en {position}.',
    positionGuardian: '{name}, de la gardienne, passe en {position}.',
    attackDirectYou:
      '{attacker} attaque directement : la gardienne perd {amount} points de vie.',
    attackDirectGuardian:
      '{attacker} t’attaque directement : tu perds {amount} points de vie.',
    attackWin: '{attacker} ({atk}) détruit {target} ({value}).',
    attackLose: '{attacker} ({atk}) est détruite par {target} ({value}).',
    attackRebound:
      '{attacker} ({atk}) se heurte à la défense de {target} ({value}).',
    attackTie:
      '{attacker} ({atk}) et {target} ({value}) se valent : rien ne se passe.',
    damageYou: ' Tu perds {amount} points de vie.',
    damageGuardian: ' La gardienne perd {amount} points de vie.',
    end: {
      won: 'Victoire ! La gardienne s’incline.',
      lost: 'Défaite. La gardienne l’emporte.',
      draw: 'Match nul : autant de points de vie de part et d’autre.',
      abandoned: 'Duel abandonné.',
    },
  },

  result: {
    title: {
      won: 'Victoire !',
      lost: 'Défaite',
      draw: 'Match nul',
      abandoned: 'Abandon',
    },
    reasonLine: 'Fin du duel : {reason}.',
    lpLine: 'Points de vie : toi {player}, la gardienne {npc}.',
    rewardGranted:
      'Paquet de la semaine gagné ! Il t’attend avec tes autres paquets.',
    rewardOpen: 'Ouvrir mes paquets',
    rewardWeekAlready:
      'Paquet de la semaine déjà gagné ({week}) : cette victoire est pour l’honneur.',
    rewardPending:
      'Ta victoire est enregistrée ; ton paquet n’a pas encore pu être écrit. Recharge le duel dans un instant.',
    rewardReload: 'Recharger',
    rewardNone:
      'Pas de paquet pour ce duel : seule une victoire rapporte le paquet de la semaine.',
    again: 'Rejouer',
    backLobby: 'Retour au salon',
  },

  errors: {
    duel_active: 'Un duel est déjà en cours : reprends-le ou abandonne-le.',
    deck_incomplete: 'Ton deck doit compter 20 cartes.',
    deck_too_small:
      'Trop de cartes de ton deck ont quitté ta collection : refais ton deck.',
    duel_outdated:
      'Ce duel suit une ancienne version des règles : il ne peut plus que s’abandonner.',
    collection_unreadable: 'Ta collection n’a pas pu être lue. Réessaie.',
    duel_not_found: 'Ce duel n’existe pas (ou plus).',
  },
});
