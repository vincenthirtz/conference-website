// lib/i18n/locales/admin-fr/adminTenantsNew.ts
//
// Traductions FRANCAISES du namespace `adminTenantsNew` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTenantsNew', {
  errorNameRequired: 'Le nom est requis.',
  errorSlugRequired: 'Le slug est requis.',
  errorSlugInvalid:
    'Slug invalide. Utilise kebab-case (a-z, 0-9, séparateurs « - »).',
  toastCreated: 'Tenant « {slug} » créé.',
  errorCreate: 'Création impossible.',
  pageTitle: 'Admin – Nouveau tenant',
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Tenants',
  breadcrumbNew: 'Nouveau',
  heading: 'Nouveau tenant',
  subtitle:
    'Crée un nouveau périmètre multi-tenant (slug = identifiant technique, immuable).',
  nameLabel: 'Nom',
  namePlaceholder: 'Ex: conference 2026',
  slugLabel: 'Slug (kebab-case)',
  slugPlaceholder: 'conference-2026',
  slugHelp:
    'Auto-rempli depuis le nom. Lettres minuscules, chiffres et tirets uniquement. Cet identifiant ne pourra pas être modifié.',
  localeLabel: 'Locale par défaut',
  localeFr: 'Français (fr)',
  localeEn: 'English (en)',
  saving: 'Création…',
  submit: 'Créer le tenant',
  cancel: 'Annuler',
});
