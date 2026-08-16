// lib/i18n/locales/fr/tournamentBracket.ts
//
// Traductions FRANCAISES du namespace `tournamentBracket` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentBracket', {
  headTitle: "Bracket – {name} | OW Women's Cup",
  heading: 'Bracket – {name}',
  description:
    "L'arbre du tournoi : suivez la progression des équipes, manche après manche, jusqu'à la finale.",
  statusUpcoming: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  winnersBracket: 'Winners Bracket',
  losersBracket: 'Losers Bracket',
  emptyTitle: 'Bracket bientôt disponible',
  emptyBody:
    "L'arbre du tournoi n'est pas encore publié. En attendant, consultez la liste des matchs.",
  viewMatches: 'Voir les matchs',
});
