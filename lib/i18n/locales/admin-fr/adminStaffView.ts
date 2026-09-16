// lib/i18n/locales/admin-fr/adminStaffView.ts
//
// Traductions FRANCAISES du namespace `adminStaffView` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/adminStaffView.ts`
// (garde-fou : `../admin-parity.ts`).
//
// La fiche staff d'un compte (`/admin/users/[userId]/staff-view`).

import { adminNs } from '../../ns';

export default adminNs('adminStaffView', {
  pageTitle: 'Fiche staff — Administration',
  subtitle: 'Fiche staff',
  breadcrumbAdmin: 'Admin',
  breadcrumbUsers: 'Comptes',
  breadcrumbCurrent: 'Fiche staff',
  loading: 'Lecture…',
  loadError: 'Lecture impossible.',
  notStaff: 'Ce compte n’est pas staff : il n’a pas de fiche.',
  unnamed: 'Sans nom',
  suspended: 'Suspendu',
  poleAdmin: 'Pôle admin',
  since: 'Staff depuis le {date}',
  manageCta: 'Modifier dans Comptes',
  spacesHeading: 'Espaces',
  spacesHint:
    'Le rôle de plateforme dit ce qu’on est PARTOUT ; le rôle d’espace ce qu’on est CHEZ un client, et il élève sans déborder. Les confondre accorde des droits qu’on ne voulait pas donner.',
  spacesEmpty: 'Rattaché à aucun espace.',
  spaceInactive: 'espace inactif',
  permissionsHeading: 'Permissions effectives',
  permissionsUnavailable: 'Permissions indisponibles pour le moment.',
  permissionsCount: '{count} permissions.',
  permissionsLegend:
    'En ambre : accordées à l’unité, en plus du rôle. Les autres viennent du rôle.',
  permissionExtra: 'Accordée à l’unité',
  permissionRole: 'Vient du rôle',
  logsHeading: 'Dernières actions',
  logsEmpty: 'Aucune action enregistrée.',
  logsAll: 'Voir tout le journal de cette personne',
});
