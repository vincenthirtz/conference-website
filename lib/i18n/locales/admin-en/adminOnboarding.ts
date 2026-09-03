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
};
