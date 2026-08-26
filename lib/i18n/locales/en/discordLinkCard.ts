// lib/i18n/locales/en/discordLinkCard.ts
//
// Traductions ANGLAISES du namespace `discordLinkCard`.
//
// La SOURCE DE VERITE est le francais (`../fr/discordLinkCard.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusError: 'Unable to load status.',
  unlinkConfirm:
    'Unlink your Discord account? You will no longer receive reminder DMs.',
  linkError: 'Discord link failed',
  unlinkError: 'Failed',
  title: 'Discord',
  linkedBadge: 'Linked',
  intro:
    'Link your Discord account to get check-in reminders and tournament notifications by DM.',
  loading: 'Loading…',
  account: 'Account',
  unknown: 'unknown',
  unlink: 'Unlink',
  link: 'Link my Discord account',
  busy: '…',
  confirmUnlink: 'Confirm',
  cancel: 'Cancel',
};
