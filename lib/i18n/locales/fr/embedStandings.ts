// lib/i18n/locales/fr/embedStandings.ts
//
// Traductions FRANCAISES du namespace `embedStandings` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('embedStandings', {
  title: 'Classement',
  empty: "Le classement de ce tournoi n'est pas encore disponible.",
  viewOn: 'Voir sur {site}',
  rank: 'Rang',
  team: 'Équipe',
  prize: 'Récompense',
});
