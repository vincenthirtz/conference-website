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
  trialBadge: 'Essai gratuit',
  trialNotice:
    "Votre espace est en essai gratuit. À la fin de l'essai, il repasse sur le palier Découverte et le bot Discord cesse de répondre — souscrivez pour le garder actif.",
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
  capBroadcastStudio: 'Régie vidéo (direction auto + overlays OBS)',
  capEventOpsFull: 'complète',
  capEventOpsNone: 'aucune',
  catalogHeading: 'Souscrire ou changer de plan',
  perYear: '/ an',
  orderSummaryTitle: 'Récapitulatif de votre commande',
  orderOffer: 'Offre',
  orderTerm: 'Périodicité',
  orderTermMonth: 'Au mois',
  orderTermYear: "À l'année",
  orderTotal: 'Montant total à payer',
  orderDuration: 'Durée ouverte',
  orderDurationMonth: 'Un mois à compter du paiement',
  orderDurationYear: 'Douze mois à compter du paiement',
  orderNoRenewal:
    'Aucune reconduction tacite ni prélèvement automatique : la période suivante fera l’objet d’une nouvelle commande.',
  orderModify: 'Modifier',
  orderCgvBefore: 'J’ai lu et j’accepte les ',
  orderCgvLink: 'conditions générales de vente',
  orderCgvAfter: ' (version {version}).',
  orderWaiver:
    'Je demande l’exécution immédiate du service et je reconnais qu’une fois celui-ci pleinement exécuté, je perdrai mon droit de rétractation de quatorze jours.',
  orderConsentRequired:
    'Les deux cases doivent être cochées pour commander.',
  orderSubmit: 'Commander avec obligation de paiement',
  perMonth: '/ mois',
  termSwitchLabel: 'Périodicité',
  termMonthly: 'Au mois',
  termYearly: "À l'année",
  termYearlySaving: "À l'année, {months} mois sont offerts ({monthly} × 12 = {twelve} € contre {yearly} €).",
  currentTermMonthly: 'Vous payez au mois.',
  currentTermYearly: "Vous payez à l'année.",
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
  graceBanner: "Votre échéance est passée. Vos fonctionnalités restent actives quelques jours encore : renouvelez pour ne pas perdre votre bot Discord.",
  graceBannerUntil: "Votre échéance est passée. Vos fonctionnalités restent actives jusqu'au {date} : renouvelez avant cette date pour ne pas perdre votre bot Discord.",
});
