// lib/i18n/locales/admin-fr/developerHub.ts
//
// Traductions FRANCAISES du namespace `developerHub` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('developerHub', {
  pageTitle: 'Tableau de bord développeur',
  navLabel: 'Navigation développeur',
  backToDocs: 'Documentation',
  backToReference: 'Référence API',
  kicker: 'Espace développeur',
  heading: 'Mon tableau de bord développeur',
  intro:
    "Bonjour {name} — retrouve ici l'accès API de ton organisation, ta consommation, tes clés et webhooks, et les événements auxquels t'abonner.",
  errorLoad: 'Impossible de charger ton accès API.',
  loading: 'Chargement…',
  entitlementHeading: 'Ton accès API',
  planLabel: 'Plan',
  effectivePlanLabel: 'Plan effectif',
  apiReadLabel: 'Lecture API',
  apiWriteLabel: 'Écriture API',
  badgeEnabled: 'Activée',
  badgeLocked: 'Verrouillée',
  lockedTitle: 'API verrouillée',
  lockedBody:
    "Ton plan actuel n'inclut pas l'accès à l'API. Passe à Régie ou Circuit pour générer des clés et interroger l'API authentifiée.",
  downgradedTitle: 'Plan réduit',
  downgradedBody:
    "Ton abonnement a expiré ou est suspendu : tu es temporairement rétrogradé et tes quotas API sont réduits. Réactive ton plan pour retrouver l'accès complet.",
  upgradeCta: "Débloque l'API — passe à Régie/Circuit",
  monthUsageLabel: 'Utilisation ce mois-ci',
  monthUsageValue: '{used} / {limit} requêtes',
  monthUsageUnlimited: '{used} requêtes',
  unlimited: 'illimité',
  rateLimitLabel: 'Limite par minute',
  rateLimitValue: '{limit} req/min',
  rateLimitCurrent: '{used} sur la minute en cours',
  monthWindowLabel: 'Fenêtre mensuelle',
  tokensHintShort: 'Les requêtes authentifiées comptent dans ce quota.',
  keysHeading: 'Clés API',
  manageKeys: 'Gérer mes clés',
  keysEmpty: 'Crée ta première clé',
  keysCount: '{count} clé(s) active(s)',
  lastUsedLabel: 'Dernier usage',
  neverUsed: 'Jamais utilisée',
  moreItems: '+ {count} de plus',
  webhooksHeading: 'Webhooks',
  manageWebhooks: 'Gérer mes webhooks',
  webhooksEmpty: 'Crée ton premier webhook',
  webhooksCount: '{count} abonnement(s)',
  statusActive: 'Actif',
  statusDisabled: 'Désactivé',
  catalogHeading: 'Événements webhook disponibles',
  catalogIntro:
    "Abonne une URL pour recevoir ces événements en POST signé. Chaque livraison est signée pour que tu puisses en vérifier l'authenticité.",
  catalogEmpty: 'Aucun événement disponible pour le moment.',
  referenceCta: "Référence complète de l'API",
  colEvent: 'Événement',
  colDescription: 'Description',
  signatureHeading: 'Signature',
  signatureIntro:
    'Vérifie chaque livraison en recalculant le HMAC du corps brut avec ton secret de webhook.',
  signatureHeader: 'En-tête',
  signatureAlgo: 'Algorithme',
  signatureFormat: 'Format',
});
