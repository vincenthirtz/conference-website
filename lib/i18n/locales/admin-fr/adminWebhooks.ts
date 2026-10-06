// lib/i18n/locales/admin-fr/adminWebhooks.ts
//
// Traductions FRANCAISES du namespace `adminWebhooks` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminWebhooks', {
  pageTitle: 'Webhooks — Admin',
  breadcrumbAdmin: 'Admin',
  breadcrumbTitle: 'Webhooks',
  kicker: 'Écosystème développeur',
  heading: 'Webhooks sortants',
  intro:
    "Abonnez une URL pour recevoir nos events (match terminé, tournoi finalisé, …) en POST signé HMAC-SHA256. Chaque envoi porte l'en-tête X-Webhook-Signature.",
  createHeading: 'Nouvel abonnement',
  createSubtitle:
    "Choisissez l'URL de destination et les events à recevoir. Le secret de signature ne s'affiche qu'une seule fois.",
  urlLabel: 'URL de destination (HTTPS)',
  eventsLabel: 'Events souscrits',
  eventsHint:
    "Nous n'envoyons que ces events publics. La signature se vérifie avec le secret révélé à la création.",
  descriptionLabel: 'Description (optionnel)',
  descriptionPlaceholder: 'ex : Overlay OBS, intégration Zapier…',
  creating: 'Création…',
  createButton: "Créer l'abonnement",
  listHeading: 'Abonnements',
  loading: 'Chargement…',
  emptyState: "Aucun abonnement pour l'instant. Créez-en un ci-dessus.",
  statusActive: 'Actif',
  statusDisabled: 'Désactivé',
  lastDelivery: 'Dernière livraison',
  never: 'Jamais',
  failures: '{n} échecs consécutifs',
  viewDeliveries: 'Livraisons',
  hideDeliveries: 'Masquer',
  disable: 'Désactiver',
  enable: 'Activer',
  delete: 'Supprimer',
  noDeliveries: "Aucune livraison pour l'instant.",
  colEvent: 'Event',
  colStatus: 'Statut',
  colAttempts: 'Tentatives',
  colWhen: 'Quand',
  errorLoad: 'Impossible de charger les abonnements.',
  errorUrlRequired: "L'URL est requise.",
  errorEventsRequired: 'Sélectionnez au moins un event.',
  errorCreate: "Impossible de créer l'abonnement.",
  errorGeneric: 'Une erreur est survenue.',
  toastCreated: 'Abonnement créé.',
  toastEnabled: 'Abonnement activé.',
  toastDisabled: 'Abonnement désactivé.',
  toastDeleted: 'Abonnement supprimé.',
  confirmDeleteTitle: 'Supprimer cet abonnement ?',
  confirmDeleteSubtitle:
    "L'URL cessera de recevoir des events. Cette action est irréversible.",
  edit: 'Modifier',
  cancel: 'Annuler',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  toastUpdated: 'Abonnement modifié.',
  sendTest: 'Envoyer un test',
  toastTestOk: 'Test reçu par le destinataire (HTTP {status}).',
  toastTestFailed: 'Échec du test : {error}',
  rotateSecret: 'Renouveler le secret',
  confirmRotateTitle: 'Renouveler le secret de signature ?',
  confirmRotateSubtitle:
    "L'ancien secret cesse immédiatement de signer les envois : mettez à jour le destinataire aussitôt, sinon il rejettera les signatures. Le nouveau secret ne s'affichera qu'une fois.",
  toastRotated: 'Nouveau secret généré.',
  colActions: 'Actions',
  redeliver: 'Renvoyer',
  redelivering: 'Envoi…',
  toastRedeliverOk: 'Livraison renvoyée (HTTP {status}).',
  toastRedeliverFailed: 'Nouvel échec : {error}',
});
