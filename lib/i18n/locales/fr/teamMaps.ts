// lib/i18n/locales/fr/teamMaps.ts
//
// Traductions FRANCAISES du namespace `teamMaps` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamMaps', {
  notFoundHeadTitle: "Équipe introuvable – OW Women's Cup",
  notFoundTitle: 'Équipe introuvable',
  notFoundBody: 'Impossible de trouver cette équipe.',
  backHome: "← Retour à l'accueil",
  backToTeam: 'Retour à la fiche équipe',
  mapStatsBadge: 'Stats par carte',
  perMapTitle: 'Performance par carte',
  perMapDesc:
    'Nombre de matchs, victoires, défaites et winrate par carte jouée.',
  emptyStats:
    'Aucune statistique de cartes disponible pour cette équipe pour le moment.',
  thMap: 'Carte',
  thPlayed: 'Joués',
  thW: 'V',
  thL: 'D',
  thWR: 'WR',
  thRounds: 'Rounds',
});
