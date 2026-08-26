// lib/i18n/locales/fr/homeCountdown.ts
//
// Traductions FRANCAISES du namespace `homeCountdown` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('homeCountdown', {
  kickoff: "Coup d'envoi",
  ariaLabel: 'Compte à rebours avant le tournoi',
  unitDay: 'jour',
  unitDays: 'jours',
  unitHours: 'h',
  unitMinutes: 'min',
  unitSeconds: 's',
});
