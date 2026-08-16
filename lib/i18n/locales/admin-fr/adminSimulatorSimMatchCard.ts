// lib/i18n/locales/admin-fr/adminSimulatorSimMatchCard.ts
//
// Traductions FRANCAISES du namespace `adminSimulatorSimMatchCard` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminSimulatorSimMatchCard', {
  simulate: 'Simuler',
  waiting: 'En attente',
  locked: 'Verrouille',
  unlockTitle: 'Deverrouiller ce match',
  lockTitle: 'Verrouiller ce resultat (What-if)',
  wonBy: 'Gagnee par {name}',
});
