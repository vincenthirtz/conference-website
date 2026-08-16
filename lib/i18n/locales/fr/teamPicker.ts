// lib/i18n/locales/fr/teamPicker.ts
//
// Traductions FRANCAISES du namespace `teamPicker` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamPicker', {
  searchPlaceholder: 'Rechercher une équipe...',
  loading: 'Chargement...',
  countryLabel: 'Filtrer par pays',
  countryAll: 'Tous les pays',
  membersCount: '{count}/5 membres',
  openForScrimBadge: 'cherche un scrim',
});
