// lib/i18n/locales/admin-fr/adminTcgOverview.ts
//
// Traductions FRANCAISES du namespace `adminTcgOverview` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/adminTcgOverview.ts`. Toute cle
// ajoutee ici doit l'etre aussi cote anglais : le garde-fou de compilation
// `../admin-parity.ts` casse le typecheck sinon.
//
// TON DE CE PANNEAU. Il s'adresse au staff, pas aux joueuses : les libelles
// disent ce qu'un chiffre MESURE, pas ce qu'il vaut. « Jamais ouverts » plutot
// que « en attente » — un paquet non ouvert n'attend rien, il dort.
//
// `—` N'EST PAS `0`. Le panneau affiche un tiret quand une lecture a echoue :
// aucun libelle ne doit donc suggerer qu'un compteur vide signifie « rien ».

import { adminNs } from '../../ns';

export default adminNs('adminTcgOverview', {
  tabLabel: 'Économie TCG',
  heading: 'Économie du TCG',
  subtitle: 'Ce qui circule : paquets, pièces, cartes et consentements.',
  generatedAt: 'Relevé de {time}',
  loadError: 'Impossible de charger l’état de l’économie.',
  retry: 'Réessayer',
  emptyTitle: 'L’économie n’a pas encore démarré',
  emptyDescription:
    'Aucun paquet distribué, aucune pièce en circulation. Les compteurs apparaîtront dès la première victoire.',
  // Dit que le total est MINORÉ, pas qu'il est faux : un plafond de lecture
  // atteint tronque vers le bas, jamais vers le haut.
  truncatedNotice: 'Total calculé sur une lecture plafonnée : il est minoré.',

  packsTitle: 'Paquets',
  packsGranted: 'Distribués',
  packsOpened: 'Ouverts',
  packsOpenedHint: '{percent} % des paquets',
  packsPending: 'Jamais ouverts',
  packsFromVictory: 'Offerts (victoire)',
  packsFromPurchase: 'Achetés',
  packsFromWelcome: 'Cadeau de bienvenue',

  coinsTitle: 'Monnaie',
  coinsInCirculation: 'En circulation',
  // Rappel volontaire de la règle qui structure toute l'économie : la monnaie
  // ne s'achète pas en argent réel (boîtes à butin — BE, NL, ANJ).
  coinsInCirculationHint: 'Gagnées en jouant, jamais achetées.',
  coinsWallets: 'Porte-monnaie actifs',
  coinsEarned: 'Cumul gagné',
  coinsSpent: 'Cumul dépensé',
  coinsBoosterPrice: 'Prix d’un booster :',

  // D'OÙ VIENNENT LES PIÈCES. `coinsEarned` dit combien, jamais d'où — et c'est
  // la question qu'on se pose en surveillant une économie. Les drops en direct
  // n'apparaissaient nulle part ailleurs : ils ne créent aucun paquet.
  coinsBySourceTitle: 'Origine des gains',
  coinsBySourceEmpty: 'Aucun gain enregistré.',
  coinsSourceMatchWin: 'Victoires en match',
  coinsSourceScrimWin: 'Victoires en scrim',
  coinsSourceTwitchDrop: 'Drops en direct',
  coinsSourceWelcomeGift: 'Cadeaux de bienvenue',
  coinsSourceCardRecycled: 'Doublons recyclés',
  coinsSourceAdminGrant: 'Ajustements de l’équipe',
  // Repli pour une origine que ce panneau ne connaît pas encore : on affiche sa
  // clé brute plutôt que de la masquer, sinon le total ventilé cesserait de
  // correspondre au cumul affiché juste au-dessus.
  coinsSourceUnknown: 'Autre ({kind})',

  cardsTitle: 'Cartes',
  cardsTotal: 'Possédées',
  cardsFoil: 'Brillantes',
  cardsFoilHint: '{percent} % des cartes possédées',
  cardsRecycled: 'Recyclées',
  cardsRecycledHint: '{percent} % de la production',
  cardsDrawn: 'Tirées au total',
  // Objet imbriqué, pas quatre clés à plat : le composant indexe par rareté.
  rarity: {
    common: 'Commune',
    rare: 'Rare',
    epic: 'Épique',
    legendary: 'Légendaire',
  },

  photosTitle: 'Photos et consentement',
  photosPending: 'À relire',
  photosApproved: 'Approuvées',
  photosRejected: 'Refusées',
  photosOptedIn: 'Accords en cours',
  photosRevoked: 'Accords retirés',
  photosReviewCta: 'Ouvrir la file',

  topSubjectsTitle: 'Sujets les plus distribués',
  topSubjectsEmpty: 'Aucune carte distribuée pour l’instant.',
  topSubjectsCopies: '{count} exemplaires',
  topSubjectsFoil: 'dont {count} brillantes',
  kindPlayer: 'Joueuse',
  kindTeam: 'Équipe',
  kindMap: 'Map',
  unknownSubject: 'Sujet inconnu',

  // Source navigateur OBS / Streamlabs. Le lien est un secret PORTEUR : les
  // textes disent ce que « régénérer » casse, avant qu'on clique.
  overlayHeading: 'Overlay OBS',
  overlaySubtitle:
    'Annonce en direct les cartes gagnées. À coller dans une source « Navigateur » d’OBS ou Streamlabs.',
  overlayNone: 'Aucun lien d’overlay pour cet espace.',
  overlayCreatedAt: 'Créé le {date}',
  overlayLastUsedAt: 'Dernier appel : {date}',
  overlayNeverUsed: 'Jamais utilisé',
  overlayReveal: 'Afficher',
  overlayHide: 'Masquer',
  overlayCopy: 'Copier',
  overlayCopied: 'Lien copié',
  overlayCreate: 'Créer le lien',
  overlayRotate: 'Régénérer',
  overlayRotateWarning:
    'Le lien actuel cessera immédiatement de fonctionner : l’overlay déjà configuré dans OBS deviendra muet jusqu’à ce que tu y colles le nouveau lien. À faire si le lien a circulé.',
  overlayRevoke: 'Révoquer',
  overlayRevokeWarning:
    'L’overlay cessera de fonctionner et aucun nouveau lien ne sera créé. Tu pourras en émettre un plus tard.',
  overlayWorking: 'En cours…',
  overlayLoadError: 'Impossible de lire le lien d’overlay.',
  overlaySaveError: 'L’opération a échoué, réessaie.',
  overlayObsHint:
    'Qui a ce lien voit les annonces. Il n’affiche que le pseudo Twitch et l’événement — jamais le nom du compte du site.',

  // --- Habillage de l'overlay -------------------------------------------------
  // Ces clés sont les LIBELLÉS DE L'ÉDITEUR. Les deux phrases réglables, elles,
  // sont du CONTENU : le texte de cette chaîne, saisi par la régie, dans sa
  // langue. Elles ne passent donc pas par l'i18n — d'où `themeLineHint`, qui
  // explique que laisser le champ vide restaure la phrase traduite.
  themeHeading: 'Habillage de l’overlay',
  themeSubtitle:
    'L’aperçu ci-dessous est le rendu réel de la source OBS, pas une imitation : ce qui s’y affiche est ce que verra le direct.',
  themePreviewTitle: 'Aperçu',
  themeAccent: 'Couleur d’accent',
  themePosition: 'Coin d’ancrage dans la scène',
  themePosTopLeft: 'En haut à gauche',
  themePosTopRight: 'En haut à droite',
  themePosBottomLeft: 'En bas à gauche',
  themePosBottomRight: 'En bas à droite',
  themeDropLine: 'Phrase d’un drop',
  themeWinLine: 'Phrase d’une victoire',
  themeLinePlaceholder: '{name} remporte une carte',
  themeLineHint:
    '{name} est remplacé par le pseudo Twitch. Champ vide = phrase par défaut, traduite.',
  themeMedia: 'Image ou vidéo',
  themeMediaHint:
    'PNG, JPEG ou WebP (2 Mo), MP4 ou WebM (8 Mo). Remplace l’étoile devant la phrase. Une vidéo est jouée muette et en boucle.',
  themeMediaChoose: 'Choisir un fichier',
  themeMediaRemove: 'Retirer',
  themeSaving: 'Enregistrement…',
  themeSaved: 'Habillage enregistré.',
  themeLoadError: 'Impossible de lire l’habillage.',
  themeSaveError: 'L’enregistrement a échoué, réessaie.',
  themeErrUnsupportedType:
    'Format non accepté. Utilise un PNG, JPEG, WebP, MP4 ou WebM.',
  themeErrTooLarge: 'Fichier trop lourd.',
  themeErrContentMismatch:
    'Ce fichier n’est pas du type qu’il annonce : son contenu ne correspond pas.',
  themeErrInvalidColor: 'Couleur invalide.',

  // Libellés de l'APERÇU. Ils reprennent volontairement les formulations par
  // défaut de l'overlay (`lib/i18n/locales/fr/overlayTcg.ts`) : l'aperçu doit
  // montrer ce qui s'affichera si la régie ne règle aucune phrase.
  themePreviewDropEyebrow: 'Drop',
  themePreviewWinEyebrow: 'Victoire',
  themePreviewDropLine: '{name} remporte une carte',
  themePreviewWinLine: '{name} gagne un paquet',
  themePreviewName: 'Une joueuse',

  // --- Cadeau de bienvenue ----------------------------------------------------
  // Acte COLLECTIF et IRRÉVERSIBLE : les textes annoncent le nombre avant le
  // clic, et la confirmation le répète. On ne valide pas une intention vague.
  giftHeading: 'Cadeau de bienvenue',
  giftSubtitle:
    'Crédite chaque participante engagée dans l’édition en cours. Un paquet ouvert ne se rend pas : le nombre est annoncé avant la distribution.',
  giftEligible: '{count} participante(s) avec un compte',
  giftAlreadyGifted: '{count} ont déjà reçu le cadeau',
  giftTeams: 'Sur les rosters de {teams} équipe(s) engagée(s)',
  giftReward: 'Chacune reçoit {packs} paquet et {coins} pièces',
  giftNoTournament: 'Aucune édition en cours : rien à distribuer.',
  giftNothingToDo: 'Tout le monde a déjà reçu le cadeau.',
  giftReplayHint:
    'Relancer est sans risque : seules les joueuses arrivées depuis la dernière distribution seront créditées.',
  giftGrant: 'Distribuer',
  giftGranting: 'Distribution…',
  giftConfirmTitle: 'Distribuer le cadeau de bienvenue ?',
  giftConfirmBody:
    '{count} compte(s) vont être crédités. C’est immédiat et définitif : un paquet ouvert ne se reprend pas.',
  giftGranted: '{granted} compte(s) crédité(s).',
  giftLoadError: 'Impossible de lire l’état du cadeau de bienvenue.',
  giftGrantError: 'La distribution a échoué, réessaie.',
});
