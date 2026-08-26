// lib/i18n/locales/fr/cockpitChecklist.ts
//
// Traductions FRANCAISES du namespace `cockpitChecklist` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('cockpitChecklist', {
  sessionExpired: 'Session expirée, reconnecte-toi.',
  updateFailed: 'Mise à jour échouée.',
  updateChecklistFailed: 'Impossible de mettre à jour la checklist.',
  title: 'Checklist pré-match',
  emptyBody:
    "Aucun item de checklist pour ce segment. Demande au Director de configurer la liste depuis l'admin si nécessaire.",
  validatedProgress: '{checked} / {total} validés',
  validated: 'Validé',
  validatedAtSuffix: ' à {time}',
});
