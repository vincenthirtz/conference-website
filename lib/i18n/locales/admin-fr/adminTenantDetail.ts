// lib/i18n/locales/admin-fr/adminTenantDetail.ts
//
// Traductions FRANCAISES du namespace `adminTenantDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTenantDetail', {
  errorLoad: 'Erreur de chargement',
  toastUpdated: 'Tenant mis à jour.',
  errorUpdate: 'Mise à jour impossible.',
  conferenceNoArchive: 'Le tenant « conference » ne peut pas être archivé.',
  confirmArchiveTitle: 'Archiver le tenant « {slug} » ?',
  confirmArchiveSubtitle:
    "Le tenant sera marqué is_active=false. Les staff perdront l'accès tant qu'il reste archivé.",
  archive: 'Archiver',
  toastArchived: 'Tenant archivé.',
  errorArchive: 'Archivage impossible.',
  toastStaffAdded: 'Staff ajouté au tenant.',
  errorAddStaff: 'Ajout impossible.',
  confirmRotateTitle: 'Régénérer les secrets bot du tenant ?',
  confirmRotateSubtitle:
    "Cette action invalide les anciens secrets bot. Le bot et tout système qui s'authentifie auprès du tenant devront utiliser les nouvelles valeurs.",
  rotate: 'Régénérer',
  toastRotated: 'Secrets bot régénérés.',
  errorRotate: 'Régénération des secrets impossible.',
  confirmRemoveStaffTitle: 'Retirer {name} du tenant ?',
  confirmRemoveStaffSubtitle: "Le staff perdra l'accès à ce tenant.",
  remove: 'Retirer',
  toastStaffRemoved: 'Staff retiré.',
  errorRemoveStaff: 'Retrait impossible.',
  pageTitle: 'Admin – Tenant {slug}',
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Tenants',
  loading: 'Chargement du tenant…',
  statusActive: 'Actif',
  statusArchived: 'Archivé',
  archiving: 'Archivage…',
  archiveTitleDisabled: 'Le tenant conference ne peut pas être archivé.',
  tabGeneral: 'Général',
  tabDiscord: 'Discord',
  tabStaff: 'Staff',
  tablistLabel: 'Sections du tenant',
  nameLabel: 'Nom',
  localeLabel: 'Locale par défaut',
  localeFr: 'Français (fr)',
  localeEn: 'English (en)',
  activeLabel: 'Tenant actif',
  saving: 'Sauvegarde…',
  save: 'Enregistrer',
  botSecretsHeading: 'Secrets bot',
  botSecretsDesc:
    "Régénère les secrets utilisés par le bot Discord pour s'authentifier auprès du site et signer les webhooks de ce tenant. Le nouveau secret n'est affiché qu'une seule fois, juste après la rotation.",
  rotating: 'Rotation…',
  rotateBtn: 'Rotate bot secrets',
  apiComingSoonTitle:
    'API à venir : POST /api/admin/tenants/[id]/rotate-secrets',
  apiInProgress: "API en cours d'implémentation.",
  discordEmptyTitle: 'Aucun serveur Discord lié',
  discordEmptyDesc:
    'Quand le bot est ajouté à un serveur, celui-ci apparaît ici (ou dans la file pending-guild-links si non assigné).',
  discordEmptyAction: "Voir la file d'attente",
  colGuildId: 'Guild ID',
  colGuildName: 'Nom',
  colJoinedAt: 'Rejoint le',
  colActions: 'Actions',
  configure: 'Configurer',
  staffIdLabel: 'ID du staff',
  staffIdPlaceholder: 'UUID du staff existant',
  staffRoleLabel: 'Rôle',
  addingStaff: 'Ajout…',
  addStaff: 'Ajouter',
  staffEmptyTitle: 'Aucun staff sur ce tenant',
  staffEmptyDesc: 'Ajoute un membre via le formulaire ci-dessus.',
  colStaffName: 'Nom',
  colStaffEmail: 'Email',
  colStaffRole: 'Rôle',
  colAddedAt: 'Ajouté le',
  removeStaff: 'Retirer',
  brandingHeading: 'Marque blanche',
  brandingDesc:
    'Personnalisez le logo, les couleurs et le domaine de ce tenant.',
  logoUrlLabel: 'URL du logo',
  logoUrlPlaceholder: 'https://exemple.com/logo.png',
  logoUrlHint:
    'URL http(s) absolue ou chemin relatif au site (ex : /uploads/logo.png). Laissez vide pour effacer.',
  primaryColorLabel: 'Couleur principale',
  accentColorLabel: 'Couleur d’accent',
  colorPlaceholder: '#7c3aed',
  customDomainLabel: 'Domaine personnalisé',
  customDomainPlaceholder: 'cup.monorga.gg',
  customDomainHint:
    'Nom d’hôte uniquement, sans http:// ni chemin (ex : cup.monorga.gg).',
  invalidColor:
    'La couleur doit être un code hexadécimal à 6 chiffres (ex : #7c3aed).',
  invalidDomain:
    'Le domaine doit être un nom d’hôte valide, sans schéma ni chemin.',
  previewLabel: 'Aperçu',
  previewLogoAlt: 'Aperçu du logo',
  previewNoLogo: 'Logo',
});
