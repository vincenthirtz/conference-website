// lib/i18n/locales/fr/playerLibraryHalloween.ts
//
// Traductions FRANÇAISES du namespace `playerLibraryHalloween` — SOURCE DE VÉRITÉ.
// Women's Library, lot 16 (le fantôme d'Halloween) de docs/PLAN-womens-library.md :
// l'entrée sous la scène du hall et l'inscription en un clic (mêmes envois que
// l'encart de l'espace joueuse, `soloSignup.eventCard*`). Importé seulement par
// ces écrans, chargés à la demande pendant l'événement : rien dans le premier
// chargement de /player/library. Le « Bouh ! » et le nom du fantôme (le
// moteur) restent dans `playerLibraryHall`.
// Toute clé ajoutée ici doit l'être aussi côté anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerLibraryHalloween', {
  entryTitle: 'Event Halloween',
  entryIntro:
    'Un fantôme rôde dans le hall jusqu’à l’Event Halloween du {date}. Touche-le, ou la citrouille, pour t’inscrire en un clic.',
  entryOpen: 'M’inscrire à l’Event Halloween',
  title: 'Event Halloween — {date}',
  intro:
    'Le fantôme du hall t’a repérée : viens jouer à l’Event Halloween ! Deux maps, un ultime aléatoire dans ton rôle et des bonbons virtuels à gagner.',
  opening: 'Ouverture de l’inscription…',
  loading: 'Lecture de ton inscription…',
  loadError:
    'Ton inscription n’a pas pu être lue. Tu peux t’inscrire sur la page de l’événement.',
  recapTitle: 'Ce qui sera envoyé',
  pseudo: 'Pseudo',
  battleTag: 'BattleTag',
  team: 'Équipe',
  noTeam: 'Aucune : le staff te placera dans une équipe',
  oneClick: 'M’inscrire en un clic',
  registering: 'Inscription…',
  registered: 'Tu es inscrite 🎃',
  /** Interpole {count}, {needed}, {team}. */
  waitTeam:
    '{count} / {needed} joueuses de {team} sont inscrites : l’équipe sera inscrite dès que vous serez {needed}.',
  missingProfile:
    'Il manque ton pseudo ou ton BattleTag : termine ton inscription sur la page de l’événement.',
  chooseTeam:
    'Tu joues dans plusieurs équipes : choisis la tienne sur la page d’inscription.',
  complete: 'Compléter mon inscription',
  manage: 'Mon inscription',
  details: 'Voir l’événement',
  closed: 'Les inscriptions à cet événement sont fermées pour le moment.',
  error:
    'L’inscription a échoué. Réessaie dans un instant, ou passe par la page de l’événement.',
});
