// lib/i18n/locales/admin-en/adminTournamentDiscord.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentDiscord`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentDiscord.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Discord',
  backToTournament: 'Back to tournament',
  heading: 'Discord webhooks',
  introBefore:
    'Configure one webhook per channel type. If nothing is configured for a type, the ',
  introLinkMaster: 'master configuration',
  introMiddle: ' serves as a fallback. Restricted to the ',
  introAfter: ' role.',
  strategyBefore:
    'Strategy: a webhook configured here takes precedence for this tournament. Otherwise, the global webhook declared in ',
  strategyLink: 'Site settings → Discord webhooks',
  strategyAfter: ' applies automatically.',
  overrideActiveTitle:
    'This configuration overrides the master webhook for this tournament',
  overrideActive: 'Override active',
  masterFallbackTitle: 'View / edit the master webhook',
  masterFallback: 'Master (fallback) ↗',
  notConfiguredTitle:
    'No webhook (neither override nor master) — no notifications for this channel',
  notConfigured: 'Not configured',
  webhookUrlLabel: 'Discord webhook URL',
  active: 'Active',
  roleMentionLabel:
    'Role to ping (optional) — Discord ID, "everyone", or "here"',
  roleHintBefore: 'Tip: to get a Discord role ID, type ',
  roleHintAfter:
    ' in Discord then send the message — it will display the raw ID.',
  saving: 'Saving...',
  save: 'Save',
  test: 'Test',
  delete: 'Delete',
  confirmDeleteTitle: 'Delete the "{label}" webhook for this tournament?',
  confirmDeleteSubtitle:
    'The master webhook (if one exists) will take back over for this channel.',
  confirmDeleteLabel: 'Delete',
  toastUrlRequired: 'Webhook URL required',
  toastSaved: 'Webhook saved',
  toastDeleted: 'Webhook deleted',
  toastTestSent: 'Test message sent',
  errorLoad: "Couldn't load the webhooks",
  errorSave: 'Save failed',
  errorDelete: 'Delete failed',
  errorTest: 'Test failed',
};
