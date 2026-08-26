// lib/i18n/locales/admin-en/adminSiteSettingsDiscord.ts
//
// Traductions ANGLAISES du namespace admin `adminSiteSettingsDiscord`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminSiteSettingsDiscord.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin — Discord webhooks (global)',
  back: 'Back to settings',
  heading: 'Discord webhooks — master configuration',
  introPart1: 'These webhooks apply',
  introDefault: 'by default',
  introPart2:
    'to all tournaments. If a tournament declares its own webhook for a given channel (via',
  introLink: '/admin/tournament/:id/discord',
  introPart3: "), the tournament's webhook takes over for that channel.",
  reservedPrefix: 'Reserved for the role',
  reservedSuffix: '.',
  statusActive: 'Active',
  statusConfiguredInactive: 'Configured (inactive)',
  statusNotConfigured: 'Not configured',
  webhookUrlLabel: 'Discord webhook URL',
  roleMentionLabel:
    'Role to ping (optional) — Discord ID, "everyone" or "here"',
  checkboxActive: 'Active',
  saving: 'Saving...',
  save: 'Save',
  test: 'Test',
  testDisabledTitle: 'Save the configuration first to be able to test it',
  delete: 'Delete',
  webhookUrlRequired: 'Webhook URL required',
  saveSuccess: 'Global webhook saved',
  deleteConfirmTitle: 'Delete the global webhook "{label}"?',
  deleteConfirmSubtitle:
    'Tournaments without their own configuration will no longer get any notifications for this channel type.',
  deleteConfirmLabel: 'Delete',
  deleteSuccess: 'Global webhook deleted',
  testSuccess: 'Test message sent',
};
