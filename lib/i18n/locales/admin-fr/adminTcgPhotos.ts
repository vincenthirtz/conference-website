// lib/i18n/locales/admin-fr/adminTcgPhotos.ts
//
// Traductions FRANCAISES du namespace `adminTcgPhotos` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/adminTcgPhotos.ts`. Toute cle
// ajoutee ici doit l'etre aussi cote anglais : le garde-fou de compilation
// `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTcgPhotos', {
  tabLabel: 'Photos TCG',
  heading: 'Photos de cartes à relire',
  subtitle:
    'Photos déposées par les joueuses pour leur carte. Tant qu’une photo n’est pas approuvée, la carte reste sans image.',

  empty: 'Aucune photo en attente.',
  loading: 'Chargement…',
  loadError: 'Impossible de charger la file.',

  submittedAt: 'Déposée le {date}',
  viewProfile: 'Voir la fiche',

  approve: 'Approuver',
  reject: 'Refuser',
  reasonPlaceholder: 'Motif du refus (facultatif, visible par la joueuse)',

  approved: 'Photo approuvée.',
  rejected: 'Photo refusée.',

  // Le refus supprime le fichier : c'est irréversible, on le dit avant.
  rejectHint:
    'Refuser supprime le fichier : il ne restera pas accessible par son URL. La joueuse garde le motif et peut redéposer.',

  conflict:
    'Cette photo n’est plus en attente — la joueuse l’a peut-être retirée. La liste a été rafraîchie.',
  error: 'Action impossible pour le moment.',
});
