// lib/i18n/locales/admin-fr/adminBilling.ts
//
// Traductions FRANCAISES du namespace `adminBilling` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminBilling', {
  pageTitle: 'Facturation — Abonnement',
  breadcrumbAdmin: 'Admin',
  breadcrumbBilling: 'Facturation',
  heading: 'Abonnement',
  subheading:
    'Gère le plan de ton organisation : capacités, souscription et paiements.',
  loading: 'Chargement de la facturation…',
  errorLoad: "Impossible de charger l'état de facturation.",
  noActiveTenant:
    'Aucun tenant actif. Sélectionne un tenant pour voir sa facturation.',
  currentPlanHeading: 'Plan actuel',
  statusActive: 'Actif',
  statusPastDue: 'Paiement en retard',
  statusCanceled: 'Résilié',
  startedAtLabel: 'Souscrit le',
  expiresAtLabel: 'Expire le',
  noExpiry: 'Sans expiration',
  expireInDays: 'expire dans {days} jours',
  expired: 'Expiré',
  downgradeNoticeTitle: 'Accès réduit',
  downgradeNoticeMsg:
    "Ton plan « {plan} » n'est plus honoré : les capacités sont retombées sur le palier gratuit. Renouvelle pour réactiver.",
  capabilitiesHeading: 'Capacités incluses',
  capApiRead: 'Lecture API',
  capApiWrite: 'Écriture API',
  capDiscordBot: 'Bot Discord',
  capEventOps: "Régie d'événement",
  capWhiteLabel: 'Marque blanche',
  capMultiTenant: 'Multi-tenant',
  capArbitration: 'Arbitrage des litiges',
  capRatings: 'Classement joueur',
  capEventOpsFull: 'complète',
  capEventOpsBasic: 'basique',
  capEventOpsNone: 'aucune',
  catalogHeading: 'Souscrire ou changer de plan',
  perYear: '/ an',
  currentBadge: 'Plan actuel',
  subscribe: 'Souscrire',
  renew: 'Renouveler',
  switchTo: 'Passer à {plan}',
  downgradeTo: 'Rétrograder vers {plan}',
  ownerOnlyNote: 'Seul un owner peut souscrire ou renouveler un plan.',
  associationNoticeTitle: 'Plan Association',
  associationNoticeMsg:
    "Ce compte est le système de l'association — accès complet, non soumis à la facturation.",
  customNoticeTitle: 'Plan sur-devis',
  customNoticeMsg:
    'Ton plan Éditeur est géré sur-devis. Contacte-nous pour toute évolution.',
  redirecting: 'Redirection vers le paiement…',
  ctaError: 'Impossible de générer le lien de paiement.',
  paymentsHeading: 'Historique de paiements',
  colDate: 'Date',
  colPlan: 'Plan',
  colAmount: 'Montant',
  colHelloasso: 'Réf. HelloAsso',
  paymentsEmptyTitle: 'Aucun paiement',
  paymentsEmptyDesc:
    'Les paiements apparaîtront ici après ta première souscription.',
});
