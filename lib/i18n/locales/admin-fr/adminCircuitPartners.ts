// lib/i18n/locales/admin-fr/adminCircuitPartners.ts
//
// Traductions FRANCAISES du namespace `adminCircuitPartners` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/adminCircuitPartners.ts`
// (garde-fou : `../admin-parity.ts`).
//
// Le panneau des candidatures à l'offre partenaire des circuits féminins et
// mixtes (`components/admin/onboarding/CircuitPartnersPanel.tsx`).

import { adminNs } from '../../ns';

export default adminNs('adminCircuitPartners', {
  title: 'Candidatures des circuits partenaires',
  intro:
    'Circuits féminins et mixtes qui demandent l’offre {plan} pendant {months} mois. Accorder pose le plan sur l’espace indiqué.',
  filterAll: 'Toutes',
  statusNew: 'Nouvelle',
  statusReviewing: 'En examen',
  statusApproved: 'Accordée',
  statusRejected: 'Refusée',
  empty: 'Aucune candidature dans cette vue.',
  loadError: 'Impossible de charger les candidatures.',
  retry: 'Réessayer',
  formatFeminin: 'Féminin',
  formatMixte: 'Mixte',
  fieldContact: 'Contact',
  fieldGame: 'Jeu',
  fieldFormat: 'Format',
  fieldTeams: 'Équipes attendues',
  fieldSeason: 'Début de saison',
  fieldSpace: 'Espace indiqué',
  fieldLinks: 'Liens',
  fieldCommitments: 'Engagements',
  commitmentsBoth: 'Charte et référente sécurité : oui',
  fieldNotes: 'Notes internes',
  grantedUntil: 'Offre accordée à « {slug} » jusqu’au {date}',
  receivedOn: 'Reçue le {date}',
  actionReview: 'Passer en examen',
  actionReject: 'Refuser',
  actionApprove: 'Accorder l’offre',
  labelTenantSlug: 'Slug de l’espace',
  labelNotes: 'Note (obligatoire pour un refus)',
  confirmApprove: 'Accorder l’offre à « {slug} »',
  cancel: 'Annuler',
  toastReviewed: 'Candidature passée en examen.',
  toastRejected: 'Candidature refusée.',
  toastApproved: 'Offre accordée à « {slug} ».',
  toastError: 'Action impossible : {error}',
  notesRequired: 'Indiquez le motif du refus.',
});
