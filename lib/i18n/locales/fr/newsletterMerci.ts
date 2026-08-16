// lib/i18n/locales/fr/newsletterMerci.ts
//
// Traductions FRANCAISES du namespace `newsletterMerci` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('newsletterMerci', {
  confirmedTitle: 'Merci !',
  confirmedBody: 'Ton inscription à la newsletter est confirmée.',
  invalidTitle: 'Lien invalide',
  invalidBody: 'Ce lien de confirmation est invalide ou a expiré.',
  backHome: "Retour à l'accueil",
});
