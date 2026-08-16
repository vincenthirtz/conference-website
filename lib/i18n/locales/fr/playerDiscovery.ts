// lib/i18n/locales/fr/playerDiscovery.ts
//
// Traductions FRANCAISES du namespace `playerDiscovery` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerDiscovery', {
  backToDashboard: 'Retour au tableau de bord',
  pageTitle: 'Réseau joueuses',
  pageSubtitle:
    "Retrouve les joueuses qui ont choisi d'apparaître dans le réseau. La découverte est réservée aux membres connectés.",
  searchLabel: 'Rechercher une joueuse',
  searchPlaceholder: 'Nom, pseudo Discord…',
  loading: 'Chargement…',
  emptyTitle: 'Aucune joueuse trouvée',
  emptyHint:
    "Essaie un autre nom, ou reviens plus tard : le réseau grandit à mesure que les joueuses s'y rendent visibles.",
  notDiscoverableBanner:
    "Tu n'apparais pas encore dans le réseau — active ta visibilité dans ton profil.",
  notDiscoverableCta: 'Gérer ma visibilité',
  loadMore: 'Charger plus',
  resultsCount: '{count} joueuse·s',
  statsLine: '{games} parties · pic {peak} · {tenants} orgs',
  cardTitle: 'Découverte / Réseau joueurs',
  cardDesc:
    "Rejoins l'annuaire inter-organisations. Tu es invisible par défaut ; active la découverte pour apparaître dans les recherches des autres membres. Réversible à tout moment.",
  masterSwitchLabel: 'Me rendre découvrable dans le réseau',
  masterSwitchHint:
    'Invisible par défaut. Tu peux désactiver la découverte quand tu le souhaites.',
  masterAriaLabel: 'Activer ma visibilité dans le réseau',
  taglineLabel: 'Accroche',
  taglinePlaceholder:
    'Une courte phrase pour te présenter (poste, disponibilités, objectifs…).',
  taglineCounter: '{count}/160',
  taglineSave: "Enregistrer l'accroche",
  taglineSaving: 'Enregistrement…',
  showRatingsLabel: 'Afficher mes statistiques',
  showRatingsHint:
    'Ton rating, ton pic et tes performances seront visibles sur ta fiche.',
  showRatingsAria: 'Afficher mes statistiques dans le réseau',
  showTeamsLabel: 'Afficher mes équipes',
  showTeamsHint:
    'Les équipes auxquelles tu appartiens seront visibles sur ta fiche.',
  showTeamsAria: 'Afficher mes équipes dans le réseau',
  browseLink: 'Parcourir le réseau',
  saved: 'Préférences enregistrées.',
  saveError: "Impossible d'enregistrer tes préférences.",
  loadError: 'Impossible de charger tes préférences de découverte.',
  followLabel: 'Suivre',
  followingLabel: 'Suivi ✓',
  followError: 'Impossible de mettre à jour ton abonnement.',
  followNotDiscoverable: "Cette joueuse n'est plus découvrable.",
  teamsSrLabel: 'Équipes de la joueuse',
  followerCount: '{count} abonné·es',
  tabsAria: 'Sections du réseau',
  tabDiscover: 'Découvrir',
  tabFollowing: 'Je suis',
  tabFollowers: 'Mes abonnés',
  followingEmptyTitle: 'Tu ne suis personne encore',
  followingEmptyHint:
    "Passe par l'onglet Découvrir pour trouver des joueuses à suivre.",
  followersEmptyTitle: 'Personne ne te suit encore',
  followersEmptyHint:
    'Rends-toi visible et participe au réseau pour gagner des abonnées.',
  h2hTitle: 'Confrontations cross-réseau',
  h2hCaveat:
    "Résultats équipe contre équipe, au sein d'un même match — pas des duels individuels.",
  h2hPlayed: '{count} confrontation·s',
  h2hEmpty: "Aucune confrontation pour l'instant.",
  h2hYourWins: 'Tes victoires',
  h2hTheirWins: 'Ses victoires',
  h2hDraws: 'Nuls',
  h2hResultWin: 'Victoire',
  h2hResultLoss: 'Défaite',
  h2hResultDraw: 'Nul',
  h2hResultWinShort: 'V',
  h2hResultLossShort: 'D',
  h2hResultDrawShort: 'N',
  listError: 'Impossible de charger les joueuses. Réessaie.',
  loadMoreError: 'Impossible de charger plus de joueuses. Réessaie.',
  retry: 'Réessayer',
});
