// lib/i18n/locales/admin-fr/adminPendingGuildLinks.ts
//
// Traductions FRANCAISES du namespace `adminPendingGuildLinks` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminPendingGuildLinks', {
  errorLoad: 'Erreur de chargement',
  errorSelectTenant: 'Sélectionne un tenant.',
  errorSlugNameRequired: 'Slug et nom requis.',
  errorSlugInvalid: 'Slug invalide (kebab-case).',
  toastAssigned: 'Serveur attribué.',
  errorAssign: "Échec de l'attribution.",
  confirmRejectTitle: 'Rejeter {name} ?',
  confirmRejectSubtitle:
    "La demande sera supprimée de la file. Le bot sera ignoré tant qu'il n'aura pas re-demandé.",
  reject: 'Rejeter',
  toastRejected: 'Demande rejetée.',
  errorReject: 'Rejet impossible.',
  pageTitle: 'Admin – Serveurs Discord en attente',
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Tenants',
  breadcrumbCurrent: 'File serveurs Discord',
  heading: 'Serveurs Discord en attente',
  subtitle:
    "Quand le bot rejoint un serveur sans tenant assigné, le serveur attend ici qu'un staff l'attribue à un tenant existant ou crée un nouveau tenant.",
  loading: 'Chargement de la file…',
  emptyTitle: 'Aucun serveur en attente.',
  emptyDesc:
    "Tu seras notifié·e ici dès qu'un serveur Discord aura besoin d'être attribué.",
  colGuild: 'Guild',
  colOwner: 'Owner Discord ID',
  colRequested: 'Demandé le',
  colActions: 'Actions',
  noName: '— sans nom —',
  assign: 'Attribuer…',
  modalTitle: 'Attribuer {name}',
  modalSubtitle: 'Choisis un tenant existant ou crée-en un nouveau.',
  cancel: 'Annuler',
  assigning: 'Attribution…',
  assignBtn: 'Attribuer',
  modeExisting: 'Tenant existant',
  modeNew: 'Nouveau tenant',
  tenantLabel: 'Tenant',
  selectPlaceholder: '— sélectionner —',
  archivedSuffix: ' (archivé)',
  slugLabel: 'Slug (kebab-case)',
  slugPlaceholder: 'mon-evenement',
  nameLabel: 'Nom',
  namePlaceholder: 'Mon événement',
});
