// lib/i18n/locales/admin-fr/adminOnboarding.ts
//
// Traductions FRANCAISES du namespace `adminOnboarding` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminOnboarding', {
  pageTitle: 'Admin – Onboarding',
  heading: 'Onboarding',
  subtitle:
    "Files d'approbation plateforme : demandes self-service, liens Discord en attente.",
  breadcrumbAdmin: 'Admin',
  breadcrumbCurrent: 'Onboarding',
  tabsAriaLabel: "Sections d'onboarding",
  tabQueue: "File d'onboarding",
  tabTenantRequests: 'Demandes de tenant',
  tabGuildLinks: 'Liens Discord',
  createTenantCta: 'Créer un espace',
  tabReadiness: "Espaces",
  readinessLoading: "Chargement des espaces…",
  readinessLoadError: "État des espaces indisponible.",
  readinessEmpty: "Aucun espace à afficher.",
  readinessAllReady: "Tous les espaces sont opérationnels.",
  readinessBlockedCount: "{count} espace(s) ont encore quelque chose à régler.",
  readinessOnlyBlocked: "Uniquement ceux à régler",
  readinessReady: "Opérationnel",
  readinessBlockers: "{count} à régler",
  readinessTrial: "Essai",
  readinessTrialDays: "Essai — {days} j",
  readinessTrialEndingSoon: "Essai bientôt fini",
  criterionBot: "Bot",
  criterionGuilds: "{count} serveur(s)",
  criterionConfig: "{count} réglage(s) Discord",
  criterionOwners: "{count} propriétaire(s)",
  criterionEmail: "Envoi d’emails",
  blockerInactive: "Espace désactivé",
  blockerNoPlan: "Plan sans bot",
  blockerNoGuild: "Aucun serveur Discord",
  blockerNoStaff: "Personne rattaché à l’espace",
  blockerNoConfig: "Discord non configuré",
  blockerNoEmail: "Envoi d’emails non configuré",
});
