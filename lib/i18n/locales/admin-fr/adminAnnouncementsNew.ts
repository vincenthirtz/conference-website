// lib/i18n/locales/admin-fr/adminAnnouncementsNew.ts
//
// Traductions FRANCAISES du namespace `adminAnnouncementsNew` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminAnnouncementsNew', {
  pageTitle: 'Admin – Nouvelle annonce',
  back: 'Retour a la liste des annonces',
  heading: 'Nouvelle annonce',
  subtitle:
    "Creez un bandeau publicitaire ou une annonce pour la page d'accueil.",
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
  creating: 'Creation en cours...',
  submit: "Creer l'annonce",
  cancel: 'Annuler',
  sectionPreview: 'Apercu',
  previewTitleFallback: "Titre de l'annonce",
  statusActive: 'Actif',
  statusInactive: 'Inactif',
  priority: 'Priorite {priority}',
  sectionInfo: 'Informations',
  infoBanner: "L'annonce sera affichee en bandeau sur la page d'accueil.",
  infoSchedule:
    "Les dates permettent de programmer l'affichage automatiquement.",
  infoPriority:
    "Une priorite elevee affiche l'annonce en premier si plusieurs sont actives.",
  errorTitleRequired: "Le titre de l'annonce est obligatoire.",
  errorMessageRequired: "Le message de l'annonce est obligatoire.",
  errorCreate: "Erreur lors de la création de l'annonce",
  errorCreateUnknown: "Erreur inconnue lors de la création de l'annonce",
});
