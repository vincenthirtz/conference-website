// lib/i18n/locales/admin-fr/adminAnnouncementEdit.ts
//
// Traductions FRANCAISES du namespace `adminAnnouncementEdit` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminAnnouncementEdit', {
  pageTitle: "Admin – Modifier l'annonce",
  pageTitleLoading: 'Admin – Chargement...',
  pageTitleNotFound: 'Admin – Annonce introuvable',
  notFoundTitle: 'Annonce introuvable',
  notFoundText: "Cette annonce n'existe pas ou a été supprimée.",
  backToList: 'Retour à la liste',
  breadcrumbAnnouncements: 'Annonces',
  breadcrumbEdit: 'Modifier',
  back: 'Retour aux annonces',
  heading: "Modifier l'annonce",
  subtitle: 'Modifiez les informations de cette annonce.',
  delete: 'Supprimer',
  sectionGeneral: 'Informations generales',
  titleLabel: 'Titre',
  titlePlaceholder: 'Offre speciale partenaire',
  activate: "Activer l'annonce",
  messageLabel: 'Message',
  messagePlaceholder:
    'Decouvrez notre partenaire avec -20% sur votre premiere commande...',
  sectionCta: 'Call to Action (optionnel)',
  ctaLabelLabel: 'Label du bouton',
  ctaLabelPlaceholder: "Decouvrir, Voir l'offre...",
  ctaUrlLabel: 'URL du bouton',
  sectionSchedule: 'Planification',
  startDateLabel: 'Date de debut',
  startDateHint: 'Laissez vide pour afficher immediatement.',
  endDateLabel: 'Date de fin',
  endDateHint: 'Laissez vide pour une duree indefinie.',
  priorityLabel: 'Priorite',
  priorityHint: "Plus le chiffre est eleve, plus l'annonce est prioritaire.",
  cancel: 'Annuler',
  saving: 'Enregistrement...',
  submit: 'Enregistrer les modifications',
  deleteConfirm: 'Supprimer cette annonce ? Cette action est irréversible.',
  updateSuccess: 'Annonce mise à jour avec succès.',
  errorLoad: 'Erreur lors du chargement.',
  errorUnknown: 'Erreur inconnue.',
  errorTitleRequired: "Le titre de l'annonce est obligatoire.",
  errorMessageRequired: "Le message de l'annonce est obligatoire.",
  errorUpdate: "Erreur lors de la mise à jour de l'annonce",
  errorUpdateUnknown: "Erreur inconnue lors de la mise à jour de l'annonce",
  errorDelete: 'Erreur lors de la suppression.',
});
