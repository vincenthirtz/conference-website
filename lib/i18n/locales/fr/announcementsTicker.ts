// lib/i18n/locales/fr/announcementsTicker.ts
//
// Traductions FRANCAISES du namespace `announcementsTicker` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('announcementsTicker', {
  discover: 'Découvrir',
  goToAnnouncement: "Aller à l'annonce {n}",
});
