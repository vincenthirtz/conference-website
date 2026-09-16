// lib/i18n/locales/fr/playerTcg.ts
//
// Traductions FRANCAISES du namespace `playerTcg` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/playerTcg.ts`. Toute cle ajoutee ici doit
// l'etre aussi cote anglais : le garde-fou de compilation `../parity.ts` casse
// le typecheck sinon.
//
// TON DE CETTE SECTION. Il s'agit de la photo d'une personne reelle, posee sur
// un objet que d'autres collectionnent. Les textes disent donc ce qui va se
// passer AVANT de demander le fichier — ou la photo apparait, qui peut
// l'obtenir, et comment revenir en arriere — plutot que de presenter un simple
// bouton d'envoi.

import { ns } from '../../ns';

export default ns('playerTcg', {
  title: 'Ma carte à collectionner',

  // Explication d'abord, bouton ensuite.
  intro:
    'Les joueuses ont une carte dans le TCG de la Women’s Cup. Tu peux y mettre ta photo — ou la laisser sans, ta carte existe quand même.',

  consentTitle: 'Ce que ça implique',
  consentPublic:
    'Ta photo sera visible publiquement sur ta carte, et d’autres joueuses pourront l’obtenir en ouvrant leurs paquets.',
  consentModerated:
    'Elle est relue par l’équipe avant d’être publiée. Tant qu’elle ne l’est pas, ta carte reste sans photo.',
  consentRevocable:
    'Tu peux la retirer quand tu veux : elle disparaît alors aussi des cartes déjà distribuées, pas seulement des prochaines.',

  // États
  statusNone: 'Aucune photo',
  statusPending: 'En attente de relecture',
  statusApproved: 'Photo publiée',
  statusRejected: 'Photo refusée',
  rejectedReason: 'Motif : {reason}',
  rejectedNoReason: 'Aucun motif précisé.',

  // Actions
  choose: 'Choisir une photo',
  replace: 'Remplacer la photo',
  remove: 'Retirer ma photo',
  removing: 'Retrait…',
  uploading: 'Envoi…',
  confirmRemove:
    'Retirer ta photo ? Elle disparaîtra aussi des cartes déjà distribuées.',

  formatsHint: 'JPEG, PNG ou WebP, {mo} Mo maximum.',
  // Cette phrase disait l'inverse de ce que fait le code : remplacer une photo
  // repasse le statut à `pending`, et le lecteur public ne sert QUE l'`approved`
  // — l'ancienne disparaît donc pendant la relecture. Le comportement est le bon
  // (le sens prudent) ; c'était la phrase qui mentait, au sujet de sa photo.
  replaceWarning:
    'Une nouvelle photo repasse par la relecture : le temps de la validation, ta carte n’affiche plus l’ancienne.',

  // Retours
  uploadSuccess: 'Photo envoyée. Elle sera relue avant publication.',
  removeSuccess: 'Photo retirée.',

  // Erreurs — les codes viennent de l'API (utils/uploads/imageBytes.ts).
  errMissingData: 'Aucun fichier reçu.',
  errUnsupportedType: 'Format non accepté. Utilise un JPEG, un PNG ou un WebP.',
  errInvalidBase64: 'Fichier illisible. Réessaie avec une autre image.',
  errTooLarge: 'Fichier trop lourd : {mo} Mo maximum.',
  errContentMismatch:
    'Ce fichier n’est pas une image valide, malgré son extension.',
  errGeneric: 'Envoi impossible pour le moment. Réessaie dans un instant.',

  /* --- Collection et paquets --- */

  collectionTitle: 'Ma collection',
  collectionEmpty:
    'Aucune carte pour l’instant. Gagne un match pour recevoir ton premier paquet.',
  collectionCount: '{distinct} cartes différentes · {total} exemplaires',

  packsTitle: 'Mes paquets',
  packsNone: 'Aucun paquet à ouvrir.',
  packsUnopened_one: '{count} paquet à ouvrir',
  packsUnopened_other: '{count} paquets à ouvrir',
  packOpen: 'Ouvrir',
  packOpening: 'Ouverture…',
  packFromVictory: 'Gagné en match',
  packFromPurchase: 'Acheté',
  packFromWelcome: 'Cadeau de bienvenue',

  balance: '{count} pièces',
  // Variantes SANS le mot, pour les endroits qui portent la pastille de pièce
  // (`components/tcg/TcgCoin.tsx`) : l'icône dit déjà « pièces », le répéter
  // ferait « ⬤ 100 pièces ». Les phrases en prose gardent le mot, elles.
  balanceLabel: 'Solde',
  buyBoosterShort: 'Acheter un booster',
  // Le barème vient de l'API : la page l'affiche sans le connaître.
  earnHint: '{match} pièces par victoire en match, {scrim} en scrim classé.',
  /**
   * Variante affichée UNIQUEMENT quand le drop est réellement branché.
   * Interpole `{match}`, `{scrim}` et `{drop}`.
   */
  earnHintWithDrop:
    '{match} pièces par victoire en match, {scrim} en scrim classé, {drop} par carte récupérée sur le stream.',
  buyBooster: 'Acheter un booster ({price} pièces)',
  buying: 'Achat…',
  buySuccess: 'Booster acheté. Il t’attend dans tes paquets.',
  errInsufficientFunds: 'Pièces insuffisantes : il t’en faut {price}.',
  errBalanceChanged: 'Ton solde a changé entre-temps. Réessaie.',
  errAlreadyOpened: 'Ce paquet est déjà ouvert.',
  errEmptyPool:
    'Aucune carte disponible pour l’instant — ton paquet reste intact.',

  // Ouverture : ce qu'on vient d'obtenir. C'est le moment du TCG — la page
  // rechargeait la collection sans jamais montrer le tirage.
  revealTitle: 'Ton paquet',
  revealSubtitle: 'Les cartes que tu viens d’obtenir.',
  revealDismiss: 'Fermer',
  revealNewCard: 'Nouvelle',

  // Historique du porte-monnaie. Les libellés sont ici et non côté serveur :
  // l'API rend le FAIT (`sourceKind`), l'interface le formule — traduire au
  // serveur l'obligerait à connaître la langue de la lectrice.
  walletTitle: 'Mes pièces',
  walletShow: 'Voir l’historique',
  walletHide: 'Masquer l’historique',
  walletEmpty: 'Aucun mouvement pour l’instant.',
  walletTruncated: 'Seuls les {count} derniers mouvements sont affichés.',
  // Progression de la collection. Les variantes `_one`/`_other` suivent la
  // convention du dépôt : c'est la PAGE qui choisit le pluriel, pas le
  // composant — sinon il faudrait lui apprendre les règles de chaque langue.
  progressTitle: 'Ta progression',
  progressCount_one: '{owned} carte sur {pool}',
  progressCount_other: '{owned} cartes sur {pool}',
  progressPercent: '{percent} % de la collection',
  progressCopies_one: '{count} exemplaire, doublons compris',
  progressCopies_other: '{count} exemplaires, doublons compris',
  progressAria: 'Progression de ta collection',
  progressByRarity: 'Par rareté',
  progressRarityCount: '{owned} / {pool}',
  progressComplete: 'Collection complète. Tu as tout.',

  // Recyclage des doublons.
  recycleAction: 'Recycler un doublon (+{refund})',
  // Le recyclage MARQUE la carte définitivement : on demande confirmation, et
  // on dit lequel des exemplaires part — le moins précieux, jamais le meilleur.
  recycleConfirmTitle: 'Recycler un doublon ?',
  recycleConfirmBody:
    'Un exemplaire de cette carte sera retiré de ta collection contre {refund} pièces. C’est le moins précieux qui part, et tu gardes le reste. C’est définitif.',
  recycleConfirmYes: 'Recycler',
  recycleConfirmNo: 'Annuler',
  recycling: 'Recyclage…',
  recycleSuccess: 'Doublon recyclé : +{refund} pièces.',
  errNotADuplicate: 'C’est ton seul exemplaire de cette carte.',
  errAlreadyRecycled: 'Cette carte a déjà été recyclée.',

  walletMatchWin: 'Victoire en match',
  walletScrimWin: 'Victoire en scrim',
  walletBoosterPurchase: 'Achat d’un booster',
  walletAdminGrant: 'Ajustement par l’équipe',
  walletCardRecycled: 'Doublon recyclé',
  // Sans ce libellé, un drop s'affichait « Mouvement » : la joueuse voyait des
  // pièces arriver sans savoir d'où — le seul gain qu'elle ne pouvait pas
  // rattacher à une action.
  walletTwitchDrop: 'Carte récupérée en direct',
  walletUnknownSource: 'Mouvement',

  // Raretés : mêmes paliers que les badges de la fiche joueuse.
  rarityCommon: 'Commune',
  rarityRare: 'Rare',
  rarityEpic: 'Épique',
  rarityLegendary: 'Légendaire',
  foil: 'Brillante',
  copies: '×{count}',

  /* --- Passe UX / accessibilité (2026-09-15) --- */

  // Chargement et erreur. Une lecture ratée ne doit JAMAIS s'afficher comme une
  // collection vide : ce serait annoncer une perte qui n'a pas eu lieu.
  loadErrorTitle: 'Impossible de charger ta collection pour le moment.',
  loadErrorBody:
    'Tes cartes et tes pièces ne sont pas perdues : c’est seulement la lecture qui a échoué.',
  retry: 'Réessayer',
  loadingCollection: 'Chargement de ta collection…',
  loadMoreError: 'La suite n’a pas pu être chargée. Réessaie.',

  // Pagination de la collection et des paquets.
  collectionLoadMore: 'Afficher plus de cartes',
  collectionLoadingMore: 'Chargement…',
  collectionShown: '{shown} cartes affichées sur {distinct}',
  packsLoadMore: 'Voir les autres paquets',

  // État vide, contextualisé : on dit ce qu'on peut faire MAINTENANT.
  collectionEmptyWithPacks_one:
    'Ta collection est encore vide, mais un paquet t’attend juste au-dessus.',
  collectionEmptyWithPacks_other:
    'Ta collection est encore vide, mais {count} paquets t’attendent juste au-dessus.',
  collectionEmptyGoToPacks: 'Aller à mes paquets',
  collectionEmptyGuide: 'Comment gagner des cartes',

  // Révélation d'un paquet. `revealAnnounce` est lu par la région `aria-live`,
  // `revealSummary_*` est affiché : la même information, deux formes.
  revealDuplicate: 'Doublon',
  revealSummary_none:
    'Aucune nouvelle carte cette fois — que des doublons à recycler.',
  revealSummary_one: '1 nouvelle carte sur {count}.',
  revealSummary_other: '{fresh} nouvelles cartes sur {count}.',
  revealDuplicateHint:
    'Un doublon se recycle depuis ta collection : +{refund} pièces par exemplaire, et tu gardes toujours le meilleur.',
  revealAnnounce: 'Paquet ouvert. {cards}',
  revealAnnounceCard: '{name}, {rarity}',
  revealAnnounceNew: 'nouvelle',
  revealAnnounceDuplicate: 'doublon',
  revealAnnounceFoil: 'brillante',
  revealUnnamed: 'Carte sans nom',

  // Recyclage : ce qu'on gagne est dit AVANT de confirmer, chiffré.
  recycleAria: 'Recycler un doublon de {name}, +{refund} pièces',
  recycleConfirmTitleNamed: 'Recycler un doublon de {name} ?',
  recycleConfirmGain: 'Tu reçois',
  recycleConfirmBalance: 'Ton solde',
  recycleConfirmKeep_one: 'Il t’en restera 1 exemplaire.',
  recycleConfirmKeep_other: 'Il t’en restera {count} exemplaires.',
  recycleConfirmWhich:
    'C’est l’exemplaire le moins précieux qui part : ta carte garde sa meilleure rareté. C’est définitif.',
  // Échanges en attente : on AVERTIT avant de recycler, on n'interdit pas. Le
  // premier message est le seul où recycler casse quelque chose.
  recycleConfirmEngaged:
    'Cet exemplaire est engagé dans un échange en attente : le recycler annulera cet échange quand ta partenaire voudra l’accepter.',
  recycleConfirmEngagedOther_one:
    'Un autre exemplaire est engagé dans un échange en attente : il n’est pas concerné par ce recyclage.',
  recycleConfirmEngagedOther_other:
    '{count} autres exemplaires sont engagés dans des échanges en attente : ils ne sont pas concernés par ce recyclage.',
  // Pastille du lien « Échanger des cartes » : propositions REÇUES en attente.
  // Le DM Discord ne touche pas qui n'a pas relié Discord ou ferme ses DM.
  tradesPendingBadge_one: '1 proposition d’échange en attente',
  tradesPendingBadge_other: '{count} propositions d’échange en attente',

  // Historique : les deux cadeaux d'accueil tombaient dans « Mouvement ».
  walletLoading: 'Chargement de l’historique…',
  walletError: 'Historique illisible pour le moment.',
  walletWelcomeGift: 'Cadeau de bienvenue',
  walletSupporterWelcome: 'Cadeau d’accueil supportrice',
  // Origines sans match (2026-09-15) : sans libellé, elles s'affichaient
  // « Gagné en match » ou « Mouvement ».
  packFromDrop: 'Récupéré en direct',
  packFromPlacement: 'Classement de tournoi',
  packFromStreak: 'Série de check-ins',
  walletCheckinStreak: 'Série de check-ins',
  walletTournamentPlacement: 'Classement en tournoi',
  // Une fois à vie : la ligne doit dire QUEL geste l'a rapportée.
  walletBattlenetVerified: 'Compte Battle.net vérifié',
  walletCollectionSet: 'Série complétée',
  walletMatchPrediction: 'Pronostic juste',

  // Rattachement Twitch, contextualisé : ce qu'on gagne, en une phrase. Affiché
  // SEULEMENT si le drop est réellement branché (montant rendu par l'API).
  twitchPitchTitle: 'Gagne des pièces en regardant nos directs',
  twitchPitchBody:
    'Pendant un direct Twitch, chaque carte récupérée avec tes points de chaîne te rapporte {drop} pièces. Rattache ton compte une fois, et elles arrivent ici toutes seules.',
  twitchEarnLink: 'Rattacher Twitch',

  // Lien vers le guide, à côté du titre. Les questions qu'il traite — d'où
  // viennent les paquets, ce que devient ma photo — se posent en regardant
  // cette page, pas depuis le tableau de bord.
  guideLink: 'Comment ça marche ?',
});
