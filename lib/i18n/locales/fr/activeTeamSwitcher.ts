// lib/i18n/locales/fr/activeTeamSwitcher.ts
//
// Traductions FRANCAISES du namespace `activeTeamSwitcher` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('activeTeamSwitcher', {
  label: 'Équipe affichée',
  hint: 'Tu encadres plusieurs équipes : choisis celle sur laquelle tu veux agir.',
  captainBadge: 'Capitaine',
  managerBadge: 'Manager',
  overviewLink: 'Voir toutes mes équipes →',
});
