// lib/i18n/locales/admin-en/adminSiteSettings.ts
//
// Traductions ANGLAISES du namespace admin `adminSiteSettings`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminSiteSettings.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Site settings',
  heading: 'Site settings',
  subtitle: "Configure the site's global settings",
  advancedHeading: 'Advanced configurations',
  advancedSubtitle:
    'Dedicated pages for complex settings (multi-key, per type, or with testing).',
  discordTitle: 'Discord webhooks (master)',
  discordDesc:
    "Global fallback used when a tournament hasn't declared its own webhook for a channel type.",
  teamRolesTitle: 'Team roles',
  teamRolesDesc:
    'List of roles offered in the selects of the add / edit member forms.',
  saving: 'Saving...',
  save: 'Save',
  lastModified: 'Last modified:',
  preview: 'Preview:',
  videoPreviewTitle: 'Video preview',
  saveSuccess: 'Setting saved successfully',
  saveError: 'Save error.',
  contactEmailLabel: 'Contact email',
  contactEmailDesc:
    'Main contact email shown on the site (contact page, legal notice, etc.)',
  aboutVideoLabel: '"About" video URL',
  aboutVideoDesc:
    'URL of the video shown in the "About" section of the homepage (YouTube or MP4)',
  cotisationAmountLabel: 'Annual membership fee amount',
  cotisationAmountDesc: 'Annual membership fee amount for members (in euros)',
  cotisationYearLabel: 'Current membership year',
  cotisationYearDesc: 'Active membership year for payment tracking',
  eventDateLabel: 'Event date (countdown)',
  eventDateDesc:
    'ISO date of the next event shown as a countdown on the homepage. If empty, the start date of the next tournament is used. Format: 2026-06-15T18:00:00+02:00',
  tabsAriaLabel: 'Sections des paramètres',
  tabGeneral: 'Général',
  tabDiscord: 'Discord',
  tabTeamRoles: 'Rôles d’équipe',
  emailSenderHeading: 'Email sending',
  emailSenderIntro:
    'This space sends its emails from ITS OWN Brevo account: the sender address, the daily quota and the sender reputation are its own. Until an account is registered, no email is sent — the bot, the site and Discord keep working normally.',
  emailSenderPlatformNotice:
    'This space sends through the platform account, configured via environment variables. Nothing to fill in here.',
  emailSenderConfigured: 'Sending configured. Sender:',
  emailSenderNotConfigured:
    'No sending account: this space does not send any email for now.',
  emailSenderNoEncryption:
    'SECRETS_ENC_KEY is missing from the environment: the key cannot be encrypted, saving will fail.',
  emailSenderApiKeyLabel: 'Brevo API key',
  emailSenderApiKeyHelp:
    'Brevo › SMTP & API › API keys. It is encrypted and never shown again: to replace it, type it in again.',
  emailSenderFromEmailLabel: 'Sender address',
  emailSenderFromEmailHelp:
    'Must be a verified sender of this Brevo account, otherwise sending is refused.',
  emailSenderFromNameLabel: 'Display name',
  emailSenderFromLabel: 'Sender:',
  emailSenderSave: 'Save',
  emailSenderSaving: 'Checking…',
  emailSenderSaved: 'Sending account saved.',
  emailSenderSaveError: 'Could not save.',
  emailSenderClear: 'Remove the account',
  emailSenderCleared: 'Sending account removed.',
  emailSenderLoading: 'Loading…',
  emailSenderLoadError: 'Sending status unavailable.',
  tabEmailSender: 'Email sending',
};
