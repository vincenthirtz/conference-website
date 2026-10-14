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
  // Le taux PAR ORIGINE : le total mélange des populations qui ne se
  // comportent pas pareil, et c'est cet écart qui a fondé le lot T1.
  packsOpenRateHint: '{percent} % ouverts',
  packsPending: 'Jamais ouverts',
  packsFromVictory: 'Offerts (victoire)',
  packsFromPurchase: 'Achetés',
  packsFromWelcome: 'Cadeau de bienvenue',
  packsFromDrop: 'Drops en direct',
  packsFromPlacement: 'Palmarès de tournoi',
  packsFromStreak: 'Séries de check-ins',

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
  coinsSourceMatchLoss: 'Défaites en match',
  coinsSourceScrimWin: 'Victoires en scrim',
  coinsSourceTwitchDrop: 'Drops en direct',
  coinsSourceWelcomeGift: 'Cadeaux de bienvenue',
  coinsSourceCardRecycled: 'Doublons recyclés',
  coinsSourceAdminGrant: 'Ajustements de l’équipe',
  coinsSourceSupporterWelcome: 'Accueil des supportrices',
  coinsSourceCheckinStreak: 'Séries de check-ins',
  coinsSourceTournamentPlacement: 'Palmarès de tournoi',
  coinsSourceBattlenetVerified: 'Comptes Battle.net vérifiés',
  coinsSourceCollectionSet: 'Séries complétées',
  coinsSourceMatchPrediction: 'Pronostics justes',
  coinsSourcePublicMvp: 'MVP du public',
  coinsSourceTournamentParticipation: 'Participation (DNF)',
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
  kindFanart: 'Fan art',
  kindAssociation: 'L’association',
  kindMascot: 'Mascotte',
  unknownSubject: 'Sujet inconnu',

  // Renvoi de l'onglet Économie : le drop se règle dans Diffusion › Overlays,
  // ses annonces à l'antenne dans la boîte d'alertes (depuis le 2026-10-14,
  // plus d'habillage TCG à part).
  overlayMovedNotice:
    'Le drop Twitch se gère dans l’onglet Récompenses, et ses annonces à l’antenne dans les réglages de la boîte d’alertes.',
  overlayMovedLink: 'Diffusion › Overlays',

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
  // Le cas du 2026-09-14 : pièces écrites, paquets refusés par une contrainte.
  // L'écart doit se lire à l'écran, pas seulement dans les journaux.
  giftPartial:
    '{granted} compte(s) crédité(s) mais seulement {packsGranted} paquet(s) accordé(s). Les pièces ne seront pas rejouées : lis les journaux serveur avant de relancer.',
  giftLoadError: 'Impossible de lire l’état du cadeau de bienvenue.',
  giftGrantError: 'La distribution a échoué, réessaie.',
});
