// lib/i18n/locales/admin-fr/adminPartnershipRequestDetail.ts
//
// Traductions FRANCAISES du namespace `adminPartnershipRequestDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminPartnershipRequestDetail', {
  statusNew: 'Nouvelle',
  statusRead: 'Lue',
  statusContacted: 'Contacté',
  statusNegotiating: 'En négociation',
  statusAccepted: 'Acceptée',
  statusDeclined: 'Déclinée',
  statusArchived: 'Archivée',
  categorySuper: 'Super partenaire',
  categoryMajor: 'Partenaire majeur',
  categoryCultural: 'Partenaire culturel',
  categoryOther: 'Autre',
  errorLoad: 'Erreur de chargement.',
  toastUpdated: 'Mis à jour avec succès.',
  errorGeneric: 'Une erreur est survenue.',
  notFound: 'Demande introuvable',
  backToRequests: 'Retour aux demandes',
  pageTitle: 'Admin - {company}',
  receivedOn: 'Demande reçue le {date}',
  contactInfo: 'Informations de contact',
  contact: 'Contact',
  email: 'Email',
  phone: 'Téléphone',
  website: 'Site web',
  requestDetails: 'Détails de la demande',
  category: 'Catégorie:',
  budget: 'Budget:',
  message: 'Message',
  quickActions: 'Actions rapides',
  sendEmail: 'Envoyer un email',
  call: 'Appeler',
  createPartner: 'Créer le partenaire',
  management: 'Gestion',
  statusLabel: 'Statut',
  adminNotesLabel: 'Notes internes',
  adminNotesPlaceholder: 'Notes visibles uniquement par le staff...',
  saving: 'Enregistrement...',
  save: 'Enregistrer',
  history: 'Historique',
  historyReceived: 'Demande reçue',
  historyRead: 'Lue',
  historyContacted: 'Contacté',
  historyUpdated: 'Dernière mise à jour',
  techInfo: 'Informations techniques',
  idLabel: 'ID:',
  ipLabel: 'IP:',
});
