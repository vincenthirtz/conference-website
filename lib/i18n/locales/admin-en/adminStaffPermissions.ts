// lib/i18n/locales/admin-en/adminStaffPermissions.ts
//
// Traductions ANGLAISES du namespace admin `adminStaffPermissions`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStaffPermissions.ts`).
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string`.

export default {
  openCta: 'Permissions',
  title: '{name}’s permissions',
  intro:
    'Hand over a specific task without handing over a whole role. Permissions ticked here add to those of the role — they never remove any.',
  roleNote: 'Current role: {role}. The permissions it covers are locked.',
  fromRole: 'Covered by the role — removed by changing the role.',
  notGrantable: 'You do not hold this permission, so you cannot grant it.',
  loading: 'Loading…',
  loadError: 'Permissions could not be loaded.',
  save: 'Save',
  saving: 'Saving…',
  saved: '{name}’s permissions updated.',
  saveError: 'Saving failed.',
  cancel: 'Cancel',
};
