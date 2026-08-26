// lib/i18n/locales/en/onboardSecrets.ts
//
// Traductions ANGLAISES du namespace `onboardSecrets`.
//
// La SOURCE DE VERITE est le francais (`../fr/onboardSecrets.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errorTitle: 'Secrets unavailable',
  recoveryTitle: 'Recovery possible?',
  recoveryBody:
    'If you have never opened the page (or if the email is very recent), try the original link again. Otherwise, ask staff to rotate the secrets via',
  ourDiscord: 'our Discord',
  backHome: '← Back to home',
  successBadge: 'Success',
  secretsBadgeSub: 'Your bot secrets',
  welcome: 'Welcome, {name}',
  secretsReady: 'Your secrets are ready',
  onceBefore: 'This page is',
  onceHighlight: 'shown only once',
  onceAfter: '. Save the values below before leaving.',
  slugLabel: 'Slug:',
  nextTitle: 'What now?',
  step1a: 'Paste the variables above into the',
  step1b: 'file of the bot (e.g.',
  step1c: 'on the',
  step1d: 'side), then restart the bot.',
  step2a: 'Run a test command on your Discord server (e.g.',
  step2b: ') — if the bot replies, the link is complete.',
  step3a: 'Finalize the configuration from the',
  adminSpace: 'admin space',
  step3b:
    '(staff roles, channels, branding…). TODO: the multi-tenant staff portal is not done yet.',
  savedButton: 'I saved the secrets',
  backHomePlain: 'Back to home',
};
