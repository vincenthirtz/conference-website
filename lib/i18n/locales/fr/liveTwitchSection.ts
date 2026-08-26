// lib/i18n/locales/fr/liveTwitchSection.ts
//
// Traductions FRANCAISES du namespace `liveTwitchSection` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('liveTwitchSection', {
  defaultEyebrow: 'Live',
  defaultTitle: 'En attendant la compétition',
  defaultSubtitle:
    'Retrouvez nos chaînes partenaires, casts et analyses en attendant la compétition.',
  liveNow: 'Live en cours',
  offline: 'Hors ligne',
  descFallback: 'Streams OW, analyses et cast en direct. Suivez {label}.',
  statusUpdating: 'Mise à jour du statut…',
  viewChannel: 'Voir la chaîne',
  prev: '← Précédent',
  next: 'Suivant →',
  page: 'Page {current} / {total}',
});
