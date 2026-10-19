// lib/i18n/locales/fr/playerLibrary.ts
//
// Traductions FRANCAISES du namespace `playerLibrary` — SOURCE DE VERITE.
// Page `/player/library` (Women's Library, lot 4 de docs/PLAN-womens-library.md) :
// porte de majorite, appartement, boutique, meubles, avatar, reglages.
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// Les `code` d'erreur de l'API (`nickname_taken`, `placement_invalid`…) sont
// traduits ICI, pas cote serveur : l'API rend le fait, l'interface le formule.

import { ns } from '../../ns';

export default ns('playerLibrary', {
  title: 'Women’s Library',
  subtitle: 'Ton appartement, tes meubles et ton avatar.',
  loading: 'Ouverture de la Library…',
  loadError: 'La Library n’a pas pu être chargée.',
  retry: 'Réessayer',
  unavailable:
    'La Library est momentanément indisponible. Reviens un peu plus tard.',
  balanceLabel: 'Tes pièces',

  // Porte de majorité (première entrée). On dit POURQUOI on demande, et l'on
  // garde ouvertes les ressources de sécurité à toutes, majeures ou non.
  gateTitle: 'Avant d’entrer',
  gateWhy:
    'La Women’s Library est réservée aux adultes : on y croise d’autres joueuses et on peut y discuter.',
  gateCheckbox: 'J’ai 18 ans ou plus',
  gateSubmit: 'Entrer dans la Library',
  gateSubmitting: 'Un instant…',
  gateError: 'Ton attestation n’a pas pu être enregistrée. Réessaie.',
  safetyLink: 'Ressources et aide, ouvertes à toutes',
  minorTitle: 'La Library t’attend à tes 18 ans',
  minorBody:
    'La Women’s Library est réservée aux majeures. Le reste du site reste à toi, et les ressources de sécurité sont ouvertes à toutes.',
  bannedTitle: 'Accès suspendu',
  bannedBody:
    'Ton accès à la Women’s Library est suspendu. Pour toute question, écris à l’équipe.',
  supportLink: 'Contacter l’équipe',

  // Panneaux (onglets sous l'appartement).
  panelsLabel: 'Panneaux de la Library',
  tabShop: 'Boutique',
  tabInventory: 'Mes meubles',
  tabAvatar: 'Mon avatar',
  tabSettings: 'Réglages',

  // Vue de l'appartement (lecture seule tant que le mode déco n'est pas là).
  apartmentDefaultName: 'Appartement de {nickname}',
  apartmentCanvasLabel: 'Ton appartement en vue isométrique',
  apartmentLoading: 'Préparation de ton appartement…',
  apartmentHint:
    'Touche le sol pour te déplacer, glisse pour bouger la vue. « Décorer » pour aménager.',
  apartmentResetView: 'Recentrer la vue',
  apartmentPrivate: 'Privé',
  apartmentOpen: 'Ouvert',

  // Mode déco (phase B). Les consignes clavier sont lues par le cadre de
  // l'appartement (aria-describedby) et affichées sous lui.
  edit: {
    toggle: 'Décorer',
    done: 'Terminer',
    canvasLabel: 'Ton appartement en mode déco',
    hint: 'Choisis un meuble à poser, ou touche un meuble posé pour le sélectionner.',
    keys: 'Clavier : flèches pour déplacer d’une case · R pour pivoter · Entrée pour poser ou reprendre · Suppr pour ranger · Échap pour annuler.',
    touchHint:
      'Au doigt : touche une case pour y amener le meuble, touche-la encore pour le poser.',
    ghostTitle: 'À poser : {name}',
    ghostValid: 'Il tient ici.',
    ghostReasons: {
      out_of_bounds:
        'Il dépasse de la pièce (un cadre se pose contre un mur du fond).',
      overlap: 'Il chevauche un autre meuble.',
      unknown_furniture: 'Ce meuble ne peut pas être posé.',
    },
    rotate: 'Pivoter',
    place: 'Poser ici',
    cancel: 'Annuler',
    selectedTitle: 'Sélectionné : {name}',
    move: 'Déplacer',
    store: 'Ranger',
    deselect: 'Désélectionner',
    storedTitle: 'À poser',
    storedEmpty: 'Tous tes meubles sont posés.',
    placeAria: 'Poser {name}',
    placedTitle: 'Posés',
    placedEmpty: 'Aucun meuble posé pour l’instant.',
    selectAria: 'Sélectionner {name}',
    count: '× {count}',
    status: {
      idle: '',
      pending: 'Modifications en attente…',
      saving: 'Enregistrement…',
      saved: 'Enregistré.',
      conflict:
        'Ton appartement a été modifié ailleurs (un autre onglet ?) : voici sa dernière version.',
      invalid: 'Impossible de poser {names} ici : remis à sa place.',
      error: 'L’enregistrement n’a pas abouti.',
    },
    retry: 'Réessayer',
  },

  // Boutique.
  shopTitle: 'Boutique de meubles',
  shopIntro: 'Les meubles s’achètent avec les pièces gagnées au TCG.',
  shopEmpty: 'Aucun meuble en vente pour l’instant.',
  shopBuy: 'Acheter',
  shopBuying: 'Achat…',
  shopBuyAria: 'Acheter {name} pour {price} pièces',
  shopPriceAria: '{price} pièces',
  shopOwned: 'Possédé : {count}',
  shopBought: '{name} rejoint tes meubles.',
  shopInsufficient: 'Il te manque {missing} pièces pour {name}.',
  shopUnknown: 'Ce meuble n’est plus en vente.',
  shopRetry: 'Ton solde vient de bouger : réessaie.',
  shopError:
    'L’achat n’a pas abouti. Rien n’a été débité deux fois : tu peux réessayer.',

  // Mes meubles.
  inventoryTitle: 'Mes meubles',
  inventoryEmpty: 'Tu n’as pas encore de meuble. Fais un tour à la boutique.',
  inventorySummary: '{placed} posé(s) · {stored} rangé(s)',
  inventoryPlaced: 'Posés : {count}',
  inventoryStored: 'Rangés : {count}',
  inventoryTruncated: 'Seuls tes 1 000 premiers meubles sont affichés.',

  // Avatar.
  avatarTitle: 'Mon avatar',
  avatarPick: 'Choisis ton avatar',
  avatarOption: 'Avatar {n}',
  nicknameLabel: 'Pseudo',
  nicknameHint: 'De 3 à 20 caractères : lettres, chiffres, espaces et _ - .',
  avatarSave: 'Enregistrer',
  avatarSaving: 'Enregistrement…',
  avatarSaved: 'Ton avatar est à jour.',
  avatarErrors: {
    nickname_invalid:
      'Ton pseudo doit faire de 3 à 20 caractères : lettres, chiffres, espaces et _ - .',
    nickname_refused: 'Ce pseudo n’est pas autorisé. Choisis-en un autre.',
    nickname_taken: 'Ce pseudo est déjà pris.',
    avatar_invalid: 'Cet avatar n’existe pas.',
    generic: 'L’enregistrement n’a pas abouti. Réessaie.',
  },

  // Réglages de l'appartement.
  settingsTitle: 'Réglages de l’appartement',
  nameLabel: 'Nom de l’appartement',
  nameHint: 'De 2 à 40 caractères. Laisse vide pour garder le nom par défaut.',
  accessLabel: 'Qui peut entrer',
  accessPrivate: 'Moi seule',
  accessOpen: 'Toutes les joueuses',
  listedLabel: 'Apparaître dans la liste du hall',
  listedHint: 'Seulement pour un appartement ouvert à toutes.',
  floorLabel: 'Sol',
  wallLabel: 'Murs',
  floors: {
    parquet: 'Parquet',
    carpet: 'Moquette',
    marble: 'Marbre',
    tiles: 'Carrelage',
  },
  walls: {
    plain: 'Murs pleins',
    window: 'Avec fenêtres',
  },
  settingsSave: 'Enregistrer',
  settingsSaving: 'Enregistrement…',
  settingsSaved: 'Réglages enregistrés.',
  settingsErrors: {
    room_name_invalid:
      'Le nom doit faire de 2 à 40 caractères : lettres, chiffres, espaces et ponctuation simple.',
    room_name_refused: 'Ce nom n’est pas autorisé. Choisis-en un autre.',
    decor_invalid: 'Ce décor n’existe pas.',
    listed_requires_open:
      'Seul un appartement ouvert peut apparaître dans le hall.',
    generic: 'L’enregistrement n’a pas abouti. Réessaie.',
  },

  // Catégories du catalogue (config/library/furniture.ts).
  categories: {
    storage: 'Rangement',
    seating: 'Assises',
    lighting: 'Lumières',
    table: 'Tables',
    decor: 'Décoration',
    bed: 'Lits',
    rug: 'Tapis',
    plant: 'Plantes',
  },

  // Noms des meubles, par clé du catalogue. Une clé absente d'ici s'affiche
  // sous sa forme lisible (`coffee_table` → « coffee table ») : un meuble
  // ajouté au catalogue avant sa traduction reste nommé.
  furniture: {
    bookshelf: 'Rayonnage',
    bookshelf_filled: 'Rayonnage garni',
    bookshelf_double: 'Double rayonnage',
    shelf_small: 'Petite étagère',
    display_shelves: 'Étagère d’exposition',
    wardrobe: 'Armoire',
    cabinet: 'Buffet bas',
    drawer_cabinet: 'Commode à tiroirs',
    sideboard: 'Enfilade',
    armchair: 'Fauteuil',
    armchair_green: 'Fauteuil vert',
    chair: 'Chaise',
    chair_painted: 'Chaise peinte',
    sofa: 'Canapé',
    sofa_large: 'Grand canapé',
    bench: 'Banc',
    ottoman: 'Pouf',
    lounge_chair: 'Chaise longue',
    rocking_chair: 'Fauteuil à bascule',
    stool: 'Tabouret',
    reading_table: 'Table de lecture',
    desk: 'Bureau',
    coffee_table: 'Table basse',
    coffee_table_round: 'Table basse ronde',
    side_table: 'Guéridon',
    nightstand: 'Table de chevet',
    round_table: 'Table ronde',
    console_table: 'Console',
    reception_desk: 'Comptoir d’accueil',
    lamp: 'Lampe',
    bankers_lamp: 'Lampe de banquier',
    floor_lamp: 'Lampadaire',
    bed: 'Lit',
    daybed: 'Lit de repos',
    plant_tall: 'Grande plante',
    plant_medium: 'Plante',
    cactus: 'Cactus',
    rug_red: 'Tapis rouge',
    rug_green: 'Tapis vert',
    rug_round: 'Tapis rond',
    globe: 'Globe',
    library_ladder: 'Échelle de bibliothèque',
    notice_board: 'Tableau d’affichage',
    bust_pedestal: 'Buste sur socle',
    vase: 'Vase',
    frame_painting: 'Tableau',
    frame_modern: 'Cadre moderne',
    mirror: 'Miroir',
    wall_clock: 'Horloge murale',
  },
});
