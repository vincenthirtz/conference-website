// lib/i18n/locales/fr/tcgTrade.ts
//
// Traductions FRANCAISES du namespace `tcgTrade` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/tcgTrade.ts`. Toute cle ajoutee ici doit
// l'etre aussi cote anglais : le garde-fou de compilation `../parity.ts` casse
// le typecheck sinon.
//
// TON DE CETTE PAGE. Echanger, c'est entrer en contact avec quelqu'un. Les
// textes disent donc AVANT l'interrupteur ce que l'activation rend visible
// (son pseudo, ses doubles), qu'il n'y a pas de message, et comment revenir en
// arriere — plutot qu'un simple bouton « activer ».
//
// Les codes d'erreur de l'API (`err_<code>`) sont traduits ici : l'API rend le
// fait, l'interface le formule.

import { ns } from '../../ns';

export default ns('tcgTrade', {
  title: 'Échanges de cartes',
  entryLink: 'Échanger des cartes',
  backToCollection: '← Ma collection',
  intro:
    'Échange tes cartes en double avec d’autres collectionneuses de l’espace : une carte contre une carte, rien d’autre.',

  prefTitle: 'Recevoir des propositions',
  prefStateOn: 'Les échanges sont activés.',
  prefStateOff: 'Les échanges sont désactivés.',
  prefWhatItMeans: 'Si tu les actives :',
  prefVisible:
    'ton pseudo apparaît dans la liste des collectionneuses qui échangent, visible seulement de celles qui les ont activés aussi ;',
  prefDoubles:
    'elles voient tes cartes en double échangeables — jamais le reste de ta collection ;',
  prefNoMessage:
    'une proposition ne contient que des cartes : pas de message, pas de discussion ;',
  prefOffCancels:
    'tu peux désactiver quand tu veux : les propositions en attente sont alors annulées.',
  prefEnable: 'Activer les échanges',
  prefDisable: 'Désactiver les échanges',
  prefSaving: 'Enregistrement…',
  prefOpensOn: 'Les échanges s’ouvriront pour toi le {date}.',
  prefNoCollection:
    'Les échanges s’ouvrent une fois ta collection commencée : gagne ou achète un premier paquet.',
  prefToastOn: 'Échanges activés.',
  prefToastOff: 'Échanges désactivés.',
  prefToastOffCancelled:
    'Échanges désactivés. {count} proposition(s) en attente annulée(s).',

  rulesTitle: 'Les règles',
  rulesParity:
    'Carte contre carte, autant de chaque côté — jusqu’à {max} par échange.',
  rulesNoCoins:
    'Jamais de pièces ni de paquet fermé : la monnaie se gagne, elle ne s’échange pas.',
  rulesTradeable:
    'Seules les cartes gagnées en match, au classement ou achetées s’échangent — pas celles des cadeaux, des séries ni des drops.',
  rulesDoubles: 'Tu ne peux demander que des cartes qu’elle a en double.',
  rulesSets:
    'Une carte reçue par échange ne compte pas pour compléter une série : seules les cartes que tu as tirées toi-même comptent.',
  rulesExpiry: 'Une proposition expire au bout de {hours} h.',
  rulesLimits:
    '{sent} propositions envoyées en attente au plus, et {daily} échanges acceptés par jour.',
  rulesCooldown:
    'Après un refus, attends {hours} h avant de reproposer à la même personne.',
  rulesAge:
    'Il faut un compte d’au moins {account} jours et une collection d’au moins {collection} jours.',

  composeTitle: 'Proposer un échange',
  partnerLabel: 'Avec qui ?',
  partnerPlaceholder: 'Choisis une collectionneuse',
  partnersEmpty:
    'Personne d’autre n’a encore activé les échanges dans cet espace.',
  theirDoublesTitle: 'Ses doubles — ce que tu demandes',
  theirDoublesEmpty:
    'Elle n’a aucune carte en double à échanger pour l’instant.',
  myCardsTitle: 'Tes cartes — ce que tu offres',
  myCardsEmpty: 'Tu n’as encore aucune carte.',
  notTradeable: 'Non échangeable',
  alreadyPromised: 'Déjà promise',
  lastCopy: 'Ton dernier exemplaire',
  pickAria: '{name}, {rarity}',
  summary: 'Tu offres {offered} · tu demandes {requested}',
  parityHint: 'Choisis autant de cartes de chaque côté.',
  maxHint: '{max} cartes au plus de chaque côté.',
  submit: 'Envoyer la proposition',
  submitting: 'Envoi…',
  proposedToast: 'Proposition envoyée.',
  loading: 'Chargement…',

  boxLabel: 'Mes propositions',
  boxReceived: 'Reçues',
  boxSent: 'Envoyées',
  stateOpen: 'En attente',
  stateClosed: 'Historique',
  emptyReceived: 'Aucune proposition reçue en attente.',
  emptySent: 'Aucune proposition envoyée en attente.',
  emptyClosed: 'Rien dans l’historique.',
  loadMore: 'Voir plus',
  loadingMore: 'Chargement…',
  listError: 'Impossible de charger les propositions.',
  retry: 'Réessayer',

  fromName: 'De {name}',
  toName: 'À {name}',
  unknownName: 'Collectionneuse',
  unnamedCard: 'Carte sans nom',
  expiresOn: 'Expire le {date}',
  resolvedOn: 'Close le {date}',
  theyOffer: 'Elle t’offre',
  theyRequest: 'Elle te demande',
  youOffer: 'Tu offres',
  youRequest: 'Tu demandes',
  youOwn: 'Tu en as {count}',
  youOwnNone: 'Tu ne l’as plus',

  statusPending: 'En attente',
  statusAccepted: 'Acceptée',
  statusDeclined: 'Refusée',
  statusCancelled: 'Annulée',
  statusExpired: 'Expirée',
  reasonOfferedUnavailable: 'Une carte offerte n’était plus disponible.',
  reasonCardUnavailable: 'Une carte offerte est partie dans un autre échange.',
  reasonTradingDisabled: 'Les échanges ont été désactivés.',
  reasonProposerCancelled: 'Retirée par la proposante.',

  accept: 'Accepter',
  decline: 'Refuser',
  cancel: 'Retirer',
  working: 'Un instant…',
  acceptAria: 'Accepter la proposition de {name}',
  declineAria: 'Refuser la proposition de {name}',
  cancelAria: 'Retirer la proposition à {name}',
  confirmAcceptTitle: 'Accepter cet échange ?',
  confirmAcceptBody:
    'Tu donnes {give} carte(s) et tu en reçois {get}. L’échange est définitif.',
  confirmAcceptLastCopy:
    'Attention : tu céderais ton dernier exemplaire d’au moins une carte.',
  confirmDeclineTitle: 'Refuser cette proposition ?',
  confirmDeclineBody:
    'Elle en sera prévenue, et ne pourra pas te reproposer d’échange pendant {hours} h.',
  confirmCancelTitle: 'Retirer ta proposition ?',
  confirmBack: 'Retour',
  toastAccepted: 'Échange accepté : les cartes sont dans ta collection.',
  toastDeclined: 'Proposition refusée.',
  toastCancelled: 'Proposition retirée.',

  err_generic: 'Une erreur est survenue. Réessaie.',
  err_invalid_body: 'Proposition invalide.',
  err_invalid_items: 'Ces cartes ne peuvent pas être échangées ensemble.',
  err_self_trade: 'Pas d’échange avec toi-même.',
  err_trading_disabled: 'Active d’abord les échanges.',
  err_collection_too_recent:
    'Ton compte ou ta collection est encore trop récent pour échanger.',
  err_recipient_unavailable:
    'Cette collectionneuse ne reçoit pas de propositions.',
  err_recipient_inbox_full:
    'Cette collectionneuse a déjà trop de propositions en attente.',
  err_too_many_pending: 'Tu as déjà trop de propositions en attente.',
  err_already_pending:
    'Une proposition à cette collectionneuse est déjà en attente.',
  err_recently_declined:
    'Elle a refusé récemment : attends avant de lui reproposer.',
  err_offered_not_owned:
    'Une des cartes offertes n’est plus disponible à l’échange.',
  err_requested_not_available: 'Une des cartes demandées n’est plus en double.',
  err_not_found: 'Proposition introuvable.',
  err_not_pending: 'Cette proposition est déjà close.',
  err_expired: 'Cette proposition a expiré.',
  err_stale:
    'Une carte offerte n’est plus disponible : la proposition a été annulée.',
  err_requested_unavailable: 'Tu ne possèdes plus une des cartes demandées.',
  err_daily_limit: 'Tu as atteint le nombre d’échanges du jour.',
  err_partner_daily_limit:
    'Cette collectionneuse a atteint le nombre d’échanges du jour.',
  err_not_eligible: 'Un des deux comptes est encore trop récent pour échanger.',
});
