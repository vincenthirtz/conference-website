// lib/i18n/locales/fr/homeSponsors.ts
//
// Traductions FRANCAISES du namespace `homeSponsors` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('homeSponsors', {
  eyebrow: 'Partenaires',
  title: "Ils soutiennent l'OW Women's Cup",
  subtitle: 'Une production possible grâce à nos partenaires officiels.',
  listAria: 'Liste des partenaires',
  viewAll: 'Voir tous les partenaires',
});
