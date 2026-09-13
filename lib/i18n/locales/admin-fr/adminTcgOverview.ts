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

  coinsTitle: 'Monnaie',
  coinsInCirculation: 'En circulation',
  // Rappel volontaire de la règle qui structure toute l'économie : la monnaie
  // ne s'achète pas en argent réel (boîtes à butin — BE, NL, ANJ).
  coinsInCirculationHint: 'Gagnées en jouant, jamais achetées.',
  coinsWallets: 'Porte-monnaie actifs',
  coinsEarned: 'Cumul gagné',
  coinsSpent: 'Cumul dépensé',
  coinsBoosterPrice: 'Prix d’un booster :',

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
});
