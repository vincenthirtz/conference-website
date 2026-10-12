// lib/i18n/locales/fr/tcgCatalog.ts
//
// Traductions FRANCAISES du namespace `tcgCatalog` — SOURCE DE VERITE.
// Toute cle ajoutee ici doit l'etre aussi dans `../en/tcgCatalog.ts`
// (garde-fou de compilation : `locales/parity.ts`).
//
// Page publique du catalogue TCG. Les libelles de RARETE ne sont PAS ici :
// `TcgCard` les attend deja, et ils vivent dans `playerTcg` — les redupliquer
// donnerait deux jeux de mots libres de diverger.

import { ns } from '@/lib/i18n/ns';

export default ns('tcgCatalog', {
  eyebrow: 'Cartes à collectionner',
  title: 'Le TCG de la Women’s Cup',
  // Les montants ne sont JAMAIS écrits ici : ils viennent du barème réel
  // (`utils/tcg/publicBareme.ts`) par les marqueurs `{…}`, pour que la page
  // reste juste quand le barème bouge.
  heroPitch:
    'Tes matchs deviennent des cartes. Joue, gagne des pièces, ouvre des boosters de {packSize} cartes et complète ta collection : équipes, maps du circuit, joueuses et visages de l’association.',
  heroCta: 'Commencer ma collection',
  heroCatalogLink: 'Voir toutes les cartes',
  stepsTitle: 'Comment ça marche',
  step1Title: 'Joue tes matchs',
  step1Body:
    'Chaque match de tournoi compte, gagné comme perdu — et les scrims classés aussi.',
  step2Title: 'Gagne des pièces',
  step2Body:
    'Une victoire rapporte {winCoins} pièces et un paquet offert, une défaite {lossCoins} pièces.',
  step3Title: 'Ouvre, collectionne, échange',
  step3Body:
    'Un booster coûte {boosterPrice} pièces. Complète des séries, échange tes doubles, expose tes favorites.',

  earnTitle: 'Comment gagner des pièces',
  earnLede:
    'Le barème réel du jeu. Les pièces se gagnent, elles ne s’achètent jamais : soutenir l’association et collectionner restent deux choses distinctes.',
  earnBoosterTitle: 'Le prix d’un booster',
  earnBoosterBody:
    '{price} pièces pour un paquet de {packSize} cartes — {losses} défaites de tournoi suffisent.',
  earnGroupPlay: 'En jouant',
  earnGroupTournament: 'En fin de tournoi',
  earnGroupAround: 'Autour des matchs',
  earnMatchWin: 'Victoire en match de tournoi',
  earnMatchLoss: 'Défaite en match de tournoi',
  earnScrimWin: 'Victoire en scrim classé',
  earnCheckinStreak: '{n} check-ins d’affilée de ton équipe',
  earnPlacementNote: 'Pour chaque joueuse de l’équipe, une fois par tournoi.',
  earnPlacementChampion: 'Championnes',
  earnPlacementFinalist: 'Finalistes',
  earnPlacementPodium: 'Podium',
  earnPlacementTopCut: 'Top {rank}',
  earnParticipation: 'Équipe sortie en cours de tournoi (DNF)',
  earnParticipationNote: 'Pour avoir joué une partie de la saison.',
  earnWelcome: 'Cadeau d’accueil',
  earnWelcomeNote: 'Une fois par édition, à chaque participante.',
  earnTwitchDrop: 'Drop pendant un direct Twitch',
  earnTwitchDropNote: 'Un par live, sans équipe : la voie des supportrices.',
  earnPrediction: 'Pronostic juste',
  earnPredictionNote: 'Sans mise : un pronostic ne coûte rien.',
  earnPublicMvp: 'MVP élue par le public',
  earnBattlenet: 'Compte Battle.net vérifié',
  earnBattlenetNote: 'Une seule fois.',
  earnCollectionSet: 'Série complétée',
  earnCollectionSetNote: 'Une fois par série.',
  rewardCoins: '+{n} pièces',
  rewardPacks_one: '+{n} paquet',
  rewardPacks_other: '+{n} paquets',
  earnGuideNote:
    'Forge, recyclage des doublons, échanges : toutes les règles sont dans le guide de l’espace joueuse.',
  earnGuideLink: 'Lire le guide détaillé',

  assoEyebrow: 'L’association',
  assoTitle: 'L’équipe derrière la Cup',
  assoLede:
    'Bénévoles, staff, emblèmes : l’association a ses propres cartes, à collectionner comme les autres. Fais connaissance — et essaie de toutes les réunir.',
  assoScrollHint: 'Fais glisser pour voir les autres cartes →',
  assoCarouselLabel: 'Cartes de l’association, défilement horizontal',
  assoShowAll: 'Voir les {n} cartes de l’association dans le catalogue',

  rarityTitle: 'Ce qui rend une carte rare',
  rarityLede:
    'La rareté n’est pas tirée au hasard : elle dit un parcours. Une même échelle vaut pour les joueuses et pour les équipes, pour qu’une 3e place vaille la même chose des deux côtés.',
  rarityCommonWhat: 'Le plancher : toute joueuse et toute équipe a sa carte.',
  rarityRareWhat: 'Une finale atteinte, ou un rating déjà solide.',
  rarityEpicWhat: 'Un parcours confirmé au classement.',
  rarityLegendaryWhat: 'Un titre : première place, ou le haut du classement.',
  foilNote:
    'La brillance est une variante d’impression, pas un palier de plus : une carte brillante est rare sans valoir davantage.',

  doTitle: 'Ce qu’on fait de ses cartes',
  doSetsTitle: 'Compléter des séries',
  doSetsBody:
    'Toutes les maps d’un mode, toutes les équipes d’une édition, le roster d’une équipe : chaque série complétée rapporte des pièces, une fois.',
  doTradesTitle: 'Échanger',
  doTradesBody:
    'Carte contre carte, entre collectionneuses du même espace qui l’ont choisi. Jamais de pièces ni de paquets dans un échange.',
  doShowcaseTitle: 'Montrer sa vitrine',
  doShowcaseBody:
    'Jusqu’à trois cartes favorites sur sa fiche publique, si on le souhaite. Le reste de la collection reste privé.',

  catalogTitle: 'Le catalogue',
  filterAll: 'Tout',
  filterTeams: 'Équipes',
  filterMaps: 'Maps',
  // Logos d'événement et visuels déposés par le staff.
  filterAssociation: 'L’association',
  countCards: '{n} cartes',
  // Filtre sans résultat : une grille vide ressemble à une page cassée.
  filterEmpty: 'Aucune carte dans cette catégorie pour l’instant.',

  playersTitle: 'Et les cartes de joueuses ?',
  playersCount:
    '{n} joueuses ont une carte — elles ne sont pas listées ici, et c’est voulu.',
  playersWhy:
    'Une carte de joueuse porte le portrait d’une personne réelle. Elle n’apparaît que sur sa propre fiche et sur celle de son équipe, jamais dans un annuaire public. Le site ne liste pas les joueuses : c’est une règle du projet, pas un oubli.',
  playersConsent:
    'La photo n’arrive sur une carte que si la joueuse l’a déposée elle-même, et elle peut la retirer à tout moment — y compris des cartes déjà distribuées.',

  ctaTitle: 'Prête à ouvrir ton premier paquet ?',
  ctaBody:
    'Les cartes que tu possèdes, tes paquets à ouvrir et ta progression sont dans ton espace joueuse.',
  ctaGuide: 'Comment ça marche',
});
