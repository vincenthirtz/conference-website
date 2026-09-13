// lib/i18n/locales/fr/overlayTcg.ts
//
// Traductions FRANCAISES du namespace `overlayTcg` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/overlayTcg.ts`. Toute cle ajoutee ici doit
// l'etre aussi cote anglais : le garde-fou de compilation `../parity.ts` casse
// le typecheck sinon.
//
// TON DE CETTE SECTION. Ces textes s'affichent en surimpression d'un direct,
// lus en une seconde par quelqu'un qui regarde autre chose. Ils sont donc
// courts, sans ponctuation superflue, et n'expliquent rien : l'ecran n'est pas
// le lieu d'une explication.
//
// `anonymous` EXISTE PARCE QU'UN NOM PEUT MANQUER : une victoire peut revenir a
// quelqu'un qui n'a pas rattache son compte Twitch. On affiche alors un libelle
// neutre plutot que son nom de compte du site, qu'elle n'a pas choisi de voir
// passer en direct.

import { ns } from '../../ns';

export default ns('overlayTcg', {
  docTitle: 'Overlay TCG',
  invalidToken: 'Jeton d’overlay invalide.',
  rejected: 'Overlay introuvable ou révoqué.',

  dropEyebrow: 'Drop',
  winEyebrow: 'Victoire',

  /** Interpole `{name}`. */
  dropLine: '{name} remporte une carte',
  /** Interpole `{name}`. */
  winLine: '{name} gagne un paquet',

  anonymous: 'Une joueuse',
});
