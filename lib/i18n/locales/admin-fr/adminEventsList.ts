// lib/i18n/locales/admin-fr/adminEventsList.ts
//
// Traductions FRANCAISES du namespace `adminEventsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminEventsList', {
  pageTitle: 'Admin – Run of show',
  breadcrumbAdmin: 'Admin',
  breadcrumbRunOfShow: 'Run of show',
  heading: 'Run of show',
  subtitle:
    "Planifie le déroulé d'une soirée : segments, matches, pauses, intros.",
  newEvent: '+ Nouvel event',
  tabAll: 'Tous',
  tabDraft: 'Brouillons',
  tabLive: 'En direct',
  tabDone: 'Terminés',
  errorLoad: 'Erreur de chargement.',
  loading: 'Chargement…',
  emptyTitle: 'Aucun event pour ce filtre.',
  emptyDescription:
    "Crée ton premier run-of-show pour planifier les segments d'une soirée.",
  emptyAction: 'Nouvel event',
  colName: 'Nom',
  colSlug: 'Slug',
  colScheduled: 'Date prévue',
  colStatus: 'Statut',
  colActions: 'Actions',
  openDirector: 'Ouvrir le Director',
  delete: 'Supprimer',
  confirmDeleteTitle: 'Supprimer « {name} » ?',
  confirmDeleteSubtitle:
    'Cette action supprimera définitivement le run et tous ses segments. Irréversible.',
  confirmDeleteLabel: 'Supprimer',
  deleteFailedStatus: 'Suppression échouée ({status}).',
  eventDeleted: 'Event supprimé.',
  deleteFailed: 'Suppression échouée.',
  eventCreatedToast: 'Event « {name} » créé.',
  modalTitle: 'Nouvel event',
  modalSubtitle:
    'Un event_run en mode draft. Tu pourras ajouter les segments ensuite.',
  nameLabel: 'Nom',
  namePlaceholder: 'Conférence du 21 mai',
  slugLabel: 'Slug',
  slugHint: 'Auto-généré depuis le nom. Éditable si tu veux personnaliser.',
  scheduledLabel: 'Date prévue',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Note optionnelle visible uniquement par le staff.',
  nameRequired: 'Le nom est obligatoire.',
  scheduledRequired: 'La date prévue est obligatoire.',
  createFailed: 'Création échouée.',
  cancel: 'Annuler',
  submit: 'Créer',
  submitting: 'Création…',
});
