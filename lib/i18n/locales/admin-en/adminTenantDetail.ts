// lib/i18n/locales/admin-en/adminTenantDetail.ts
//
// Traductions ANGLAISES du namespace admin `adminTenantDetail`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTenantDetail.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errorLoad: 'Loading error',
  toastUpdated: 'Tenant updated.',
  errorUpdate: 'Update failed.',
  conferenceNoArchive: 'The “conference” tenant cannot be archived.',
  confirmArchiveTitle: 'Archive tenant “{slug}”?',
  confirmArchiveSubtitle:
    'The tenant will be marked is_active=false. Staff will lose access as long as it stays archived.',
  archive: 'Archive',
  toastArchived: 'Tenant archived.',
  errorArchive: 'Archiving failed.',
  toastStaffAdded: 'Staff added to the tenant.',
  errorAddStaff: 'Adding failed.',
  confirmRotateTitle: "Regenerate the tenant's bot secrets?",
  confirmRotateSubtitle:
    'This action invalidates the old bot secrets. The bot and any system that authenticates with the tenant will need to use the new values.',
  rotate: 'Regenerate',
  toastRotated: 'Bot secrets regenerated.',
  errorRotate: 'Secret regeneration failed.',
  confirmRemoveStaffTitle: 'Remove {name} from the tenant?',
  confirmRemoveStaffSubtitle:
    'The staff member will lose access to this tenant.',
  remove: 'Remove',
  toastStaffRemoved: 'Staff removed.',
  errorRemoveStaff: 'Removal failed.',
  pageTitle: 'Admin – Tenant {slug}',
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Tenants',
  loading: 'Loading tenant…',
  statusActive: 'Active',
  statusArchived: 'Archived',
  archiving: 'Archiving…',
  archiveTitleDisabled: 'The conference tenant cannot be archived.',
  tabGeneral: 'General',
  tabDiscord: 'Discord',
  tabStaff: 'Staff',
  tablistLabel: 'Tenant sections',
  nameLabel: 'Name',
  localeLabel: 'Default locale',
  localeFr: 'Français (fr)',
  localeEn: 'English (en)',
  activeLabel: 'Active tenant',
  saving: 'Saving…',
  save: 'Save',
  botSecretsHeading: 'Bot secrets',
  botSecretsDesc:
    "Regenerate the secrets used by the Discord bot to authenticate with the site and sign this tenant's webhooks. The new secret is shown only once, right after rotation.",
  rotating: 'Rotating…',
  rotateBtn: 'Rotate bot secrets',
  apiComingSoonTitle:
    'API coming soon: POST /api/admin/tenants/[id]/rotate-secrets',
  apiInProgress: 'API implementation in progress.',
  discordEmptyTitle: 'No Discord server linked',
  discordEmptyDesc:
    'When the bot is added to a server, it appears here (or in the pending-guild-links queue if unassigned).',
  discordEmptyAction: 'View queue',
  colGuildId: 'Guild ID',
  colGuildName: 'Name',
  colJoinedAt: 'Joined on',
  colActions: 'Actions',
  configure: 'Configure',
  staffIdLabel: 'Staff ID',
  staffIdPlaceholder: 'UUID of an existing staff member',
  staffRoleLabel: 'Role',
  addingStaff: 'Adding…',
  addStaff: 'Add',
  staffEmptyTitle: 'No staff on this tenant',
  staffEmptyDesc: 'Add a member using the form above.',
  colStaffName: 'Name',
  colStaffEmail: 'Email',
  colStaffRole: 'Role',
  colAddedAt: 'Added on',
  removeStaff: 'Remove',
  brandingHeading: 'White-label branding',
  brandingDesc: "Customize this tenant's logo, colors and domain.",
  logoUrlLabel: 'Logo URL',
  logoUrlPlaceholder: 'https://example.com/logo.png',
  logoUrlHint:
    'Absolute http(s) URL or a site-relative path (e.g. /uploads/logo.png). Leave empty to clear.',
  primaryColorLabel: 'Primary color',
  accentColorLabel: 'Accent color',
  colorPlaceholder: '#7c3aed',
  customDomainLabel: 'Custom domain',
  customDomainPlaceholder: 'cup.monorga.gg',
  customDomainHint: 'Hostname only, no http:// or path (e.g. cup.monorga.gg).',
  invalidColor: 'Color must be a 6-digit hex code (e.g. #7c3aed).',
  invalidDomain: 'Domain must be a valid hostname, without scheme or path.',
  previewLabel: 'Preview',
  previewLogoAlt: 'Logo preview',
  previewNoLogo: 'Logo',
};
