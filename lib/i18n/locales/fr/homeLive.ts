// lib/i18n/locales/fr/homeLive.ts
//
// Traductions FRANCAISES du namespace `homeLive` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('homeLive', {
  ariaLabel: 'Diffusion en direct',
  liveOnTwitch: 'En direct sur Twitch',
  liveDefaultTitle: 'Le live est en cours',
  viewers_one: '{count} spectateur connecté',
  viewers_other: '{count} spectateurs connectés',
});
