// lib/i18n/locales/fr/tcgLive.ts
//
// Traductions FRANCAISES du namespace `tcgLive` — SOURCE DE VERITE.
// Toute cle ajoutee ici doit l'etre aussi dans `../en/tcgLive.ts`
// (garde-fou de compilation : `locales/parity.ts`).
//
// Le TCG « en action » cote public (`components/tcg/live/`) : derniers tirages
// rares, classement des collectionneuses, carte de la semaine, et les vitrines
// des joueuses sur la fiche d'equipe. Un nom n'apparait qu'avec une vitrine
// ACTIVE (cf. `utils/tcg/live.ts`).

import { ns } from '@/lib/i18n/ns';

export default ns('tcgLive', {
  // Derniers tirages rares
  pullsTitle: 'Derniers tirages rares',
  pullsIntro:
    'Les cartes rares, épiques et légendaires qui viennent de sortir des paquets.',
  pullsEmpty:
    'Aucun tirage rare pour l’instant : le prochain paquet sera peut-être le bon.',
  anonymousCollector: 'Une joueuse',
  pulledBy: '{name} l’a tirée',
  ageUnderHour: 'il y a moins d’une heure',
  ageHours: 'il y a {count} h',
  ageDays_one: 'hier',
  ageDays_other: 'il y a {count} jours',

  // Classement
  collectorsTitle: 'Classement des collectionneuses',
  collectorsIntro:
    'Le taux de complétion de la collection, parmi les joueuses qui ont activé leur vitrine.',
  collectorsEmpty: 'Personne au classement pour l’instant.',
  collectorsJoin: 'Active ta vitrine TCG pour y apparaître',
  collectorsRank: 'Rang',
  collectorsName: 'Joueuse',
  collectorsCards: 'Cartes',
  collectorsCompletion: 'Complétion',
  collectorsOwned: '{owned} sur {total}',
  collectorsPercent: '{value} %',

  // Carte de la semaine
  weekTitle: 'Carte de la semaine',
  weekIntro:
    'Une carte mise en avant chaque semaine, à retrouver dans le catalogue.',
  weekLabel: 'Semaine {week}',
  weekCatalogue: 'Voir le catalogue',

  // Etats
  loading: 'Chargement du TCG en direct…',

  // Fiche d'equipe
  teamShowcasesTitle: 'Vitrines TCG de l’équipe',
  teamShowcasesIntro: 'Les cartes que ses joueuses ont choisi de montrer.',
  teamShowcaseOf: 'Vitrine de {name}',
});
