// lib/i18n/locales/fr/nextMatchCard.ts
//
// Traductions FRANCAISES du namespace `nextMatchCard` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('nextMatchCard', {
  nextMatch: 'Prochain match',
  live: 'En direct',
  viewMatch: 'Voir le match',
  liveCast: 'Live cast',
  checkedIn: 'Check-in confirmé',
  checkinClosed: 'Check-in clos',
  checkinNow: 'Check-in maintenant',
  checkin: 'Check-in',
  soon: 'bientôt',
  noDate: '—',
  inFmt: 'dans {parts}',
  agoFmt: 'il y a {parts}',
  lessThanMin: "moins d'1 min",
  days: '{n}j',
  hours: '{n}h',
  mins: '{n}min',
  emptyTitle: 'Pas de prochain match',
  emptyBody: 'Ton prochain match programmé apparaîtra ici avec le check-in.',
  loadErrorShort: 'Impossible de charger ton prochain match pour le moment.',
  scoutOpponent: "Préparer l'adversaire",
});
