// lib/i18n/locales/fr/ffaStandings.ts
//
// Traductions FRANCAISES du namespace `ffaStandings` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('ffaStandings', {
  headTitle: 'Classement FFA · {name}',
  metaDescription:
    'Classement Free-For-All de {name} : points cumulés, manches jouées, meilleure place et nombre de victoires par équipe.',
  title: 'Classement FFA',
  eyebrow: 'Free-For-All',
  heading: 'Classement FFA',
  backToTournament: '← Retour au tournoi',
  viewOn: 'Voir sur {site}',
  colRank: 'Rang',
  colTeam: 'Équipe',
  colPoints: 'Points',
  colLobbies: 'Manches',
  colBest: 'Meilleure place',
  colFirsts: 'Victoires',
  empty: "Aucun résultat FFA n'est disponible pour ce tournoi pour le moment.",
});
