// lib/i18n/locales/fr/tournamentMvp.ts
//
// Traductions FRANCAISES du namespace `tournamentMvp` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentMvp', {
  headTitle: '{name} · MVP du tournoi',
  eyebrow: 'Tournoi · MVP',
  heading: 'MVP du tournoi',
  intro:
    'Classement des joueuses élues MVP par sondage Discord après chaque match. {awards} MVP attribué(s) sur {matches} match(s) terminé(s).',
  backToTournament: '← Retour au tournoi',
  teamStats: 'Stats équipes',
  allMatches: 'Tous les matchs',
  empty:
    "Aucun MVP n'a encore été désigné sur ce tournoi. Les MVP sont importés manuellement par le staff après le sondage Discord.",
  colPlayer: 'Joueuse',
  colTeam: 'Équipe',
  colMvp: 'MVP',
  unknownPlayer: 'Joueuse inconnue',
  perMatchHeading: 'MVP par match',
  viewMatch: 'Voir le match',
});
