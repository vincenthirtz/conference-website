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
  lede: 'Chaque victoire distribue un paquet de cinq cartes : des joueuses, des équipes, des maps du circuit. Voici tout ce qu’il est possible de collectionner.',

  howTitle: 'Comment on obtient des cartes',
  howEarnTitle: 'En gagnant un match',
  howEarnBody:
    'Un paquet de cinq cartes est offert à chaque victoire, aux joueuses du camp gagnant — en tournoi comme en scrim classé.',
  howDropTitle: 'En suivant un direct',
  howDropBody:
    'Pendant un stream, les points de chaîne Twitch donnent un paquet et des pièces. Aucune équipe requise : c’est la voie des supportrices.',
  howPlacementTitle: 'En finissant bien classée',
  howPlacementBody:
    'À la fin d’un tournoi, les joueuses des équipes du top 8 reçoivent des pièces et jusqu’à trois paquets selon leur rang.',
  howStreakTitle: 'En étant au rendez-vous',
  howStreakBody:
    'Une équipe qui fait ses check-ins plusieurs matchs d’affilée fait gagner un paquet et des pièces à ses titulaires.',
  howBattlenetTitle: 'En vérifiant son compte Battle.net',
  howBattlenetBody:
    'Relier son compte Battle.net au site rapporte des pièces, une seule fois.',
  howShopTitle: 'En échangeant des pièces',
  howShopBody:
    'Les pièces s’échangent contre des boosters. Elles se gagnent, jamais ne s’achètent — soutenir l’association et collectionner restent deux choses distinctes.',

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

  ctaTitle: 'Ouvrir ma collection',
  ctaBody:
    'Les cartes que tu possèdes, tes paquets à ouvrir et ta progression sont dans ton espace joueuse.',
  ctaButton: 'Voir mes cartes',
  ctaGuide: 'Comment ça marche',
});
