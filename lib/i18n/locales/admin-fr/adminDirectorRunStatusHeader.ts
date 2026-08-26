// lib/i18n/locales/admin-fr/adminDirectorRunStatusHeader.ts
//
// Traductions FRANCAISES du namespace `adminDirectorRunStatusHeader` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorRunStatusHeader', {
  slugLabel: 'Slug :',
  dateLabel: 'Date :',
  startedLabel: 'Demarre :',
  endedLabel: 'Termine :',
  segmentsLabel: 'segments',
  segmentsDone: 'termines',
  driftGaugeAria: 'Jauge de drift planifie vs reel',
  driftTitle: 'Planifie : {planned} — Reel : {real}',
  startRun: 'Demarrer le run',
  endRun: 'Terminer le run',
  runDone: 'Run termine',
});
