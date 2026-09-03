// lib/i18n/locales/admin-en/adminOnboarding.ts
//
// Traductions ANGLAISES du namespace admin `adminOnboarding`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminOnboarding.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
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
  createTenantCta: 'Create a space',
  tabReadiness: "Spaces",
  readinessLoading: "Loading spaces…",
  readinessLoadError: "Space status unavailable.",
  readinessEmpty: "No space to show.",
  readinessAllReady: "Every space is operational.",
  readinessBlockedCount: "{count} space(s) still have something to sort out.",
  readinessOnlyBlocked: "Only those needing attention",
  readinessReady: "Operational",
  readinessBlockers: "{count} to sort out",
  readinessTrial: "Trial",
  readinessTrialDays: "Trial — {days} d",
  readinessTrialEndingSoon: "Trial ending soon",
  criterionBot: "Bot",
  criterionGuilds: "{count} server(s)",
  criterionConfig: "{count} Discord setting(s)",
  criterionOwners: "{count} owner(s)",
  criterionEmail: "Email sending",
  blockerInactive: "Space disabled",
  blockerNoPlan: "Plan without bot",
  blockerNoGuild: "No Discord server",
  blockerNoStaff: "Nobody attached to the space",
  blockerNoConfig: "Discord not configured",
  blockerNoEmail: "Email sending not set up",
};
