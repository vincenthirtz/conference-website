// lib/i18n/locales/fr/overlay.ts
//
// Traductions FRANCAISES du namespace `overlay` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('overlay', {
  docTitle: 'Overlay de diffusion',
  invalidRunId: 'Identifiant de run invalide.',
  connecting: 'Connexion à la régie…',
  live: 'Live',
  camera: 'Caméra',
  sponsors: 'Partenaires',
  vs: 'VS',
  winner: 'Vainqueur',
  logoAlt: 'Logo {name}',
  brandFallback: 'La compétition',
  startingEyebrow: 'Bientôt en direct',
  startingTitle: 'Le stream va commencer',
  startingSubtitle: 'Installez-vous, ça arrive.',
  pauseEyebrow: 'Intermission',
  pauseTitle: 'Pause',
  pauseSubtitle: 'On revient dans un instant.',
  endEyebrow: "C'est terminé",
  endTitle: "Merci d'avoir suivi",
  customEyebrow: 'En direct',
  resultTitle: 'Résultat',
  resultWithFormat: 'Résultat · {format}',
  resultNoMatchTitle: 'Fin du match',
});
