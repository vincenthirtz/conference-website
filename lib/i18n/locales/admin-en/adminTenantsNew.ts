// lib/i18n/locales/admin-en/adminTenantsNew.ts
//
// Traductions ANGLAISES du namespace admin `adminTenantsNew`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTenantsNew.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errorNameRequired: 'Name is required.',
  errorSlugRequired: 'Slug is required.',
  errorSlugInvalid: 'Invalid slug. Use kebab-case (a-z, 0-9, “-” separators).',
  toastCreated: 'Tenant “{slug}” created.',
  errorCreate: 'Creation failed.',
  pageTitle: 'Admin – New tenant',
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Tenants',
  breadcrumbNew: 'New',
  heading: 'New tenant',
  subtitle:
    'Create a new multi-tenant scope (slug = technical identifier, immutable).',
  nameLabel: 'Name',
  namePlaceholder: 'e.g. conference 2026',
  slugLabel: 'Slug (kebab-case)',
  slugPlaceholder: 'conference-2026',
  slugHelp:
    'Auto-filled from the name. Lowercase letters, digits and hyphens only. This identifier cannot be changed later.',
  localeLabel: 'Default locale',
  localeFr: 'Français (fr)',
  localeEn: 'English (en)',
  saving: 'Creating…',
  submit: 'Create tenant',
  cancel: 'Cancel',
};
