// lib/i18n/locales/fr/cueFeed.ts
//
// Traductions FRANCAISES du namespace `cueFeed` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('cueFeed', {
  sevInfo: 'Info',
  sevWarn: 'Attention',
  sevUrgent: 'URGENT',
  justNow: "à l'instant",
  secondsAgo: 'il y a {count}s',
  minutesAgo: 'il y a {count}min',
  hoursAgo: 'il y a {count}h',
  daysAgo: 'il y a {count}j',
  directorCues: 'Consignes Director',
  emptyBody: "Pas de consigne pour l'instant.",
  seen: 'Vu',
  sending: 'Envoi…',
  markSeen: 'Marquer comme vu',
  retractedBadge: 'Annulé',
});
