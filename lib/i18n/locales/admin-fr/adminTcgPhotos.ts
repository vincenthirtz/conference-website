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
  noCardTitle: 'Aucune carte :',
  noCardBody:
    'ce compte n’a pas de profil joueuse. Approuvée, la photo ne s’affichera nulle part — la joueuse s’est sans doute connectée avec un autre compte que celui de son équipe.',
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

  // États de la file. Une lecture ratée n'est PAS une file vide : l'écran le
  // dit, au lieu d'afficher « aucune photo » sur une panne.
  retry: 'Réessayer',
  emptyDescription: 'Les prochaines photos déposées apparaîtront ici.',
  /** Interpole `{count}`. */
  pendingCount: '{count} photo(s) en attente',
  listLabel: 'Photos en attente de relecture',

  // Identité de la déposante : pseudo, sinon email, sinon identifiant tronqué.
  /** Interpole `{name}`. */
  photoAlt: 'Photo déposée par {name}',
  photoMissing: 'Fichier indisponible',
  /** Interpole `{name}`. Nom accessible du lien vers la fiche. */
  viewProfileOf: 'Voir la fiche de {name}',
  /** Interpole `{name}`. */
  reasonLabel: 'Motif du refus pour {name}',
  working: 'En cours…',

  // Le refus supprime le fichier : il passe par une confirmation.
  /** Interpole `{name}`. */
  confirmRejectTitle: 'Refuser la photo de {name} ?',
  confirmRejectBody:
    'Le fichier sera supprimé du stockage. La joueuse garde le motif et peut redéposer.',
  /** Interpole `{reason}`. */
  confirmRejectReason: 'Motif transmis : « {reason} »',
  confirmRejectNoReason: 'Aucun motif ne sera transmis.',
});
