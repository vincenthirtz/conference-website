// lib/i18n/locales/en/onboardIndex.ts
//
// Traductions ANGLAISES du namespace `onboardIndex`.
//
// La SOURCE DE VERITE est le francais (`../fr/onboardIndex.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  badge: 'Self-service',
  badgeSub: 'Discord bot onboarding',
  title: 'Add the Conference bot to your Discord server',
  subtitle:
    "In just a few minutes, deploy the same stack as the Overwatch women's teams Conference: tournament management, scrims, casts, role-sync — all driven from your Discord server.",
  feature1Title: 'Full tournament management',
  feature1Desc:
    'Brackets, groups, seeding, vetoes, map draft — orchestrated directly from Discord and synced with the site.',
  feature2Title: 'Scrims & friendlies',
  feature2Desc:
    'Your teams propose and accept scrims via the bot. Casters automatically get their assignments.',
  feature3Title: 'Tracked casts and streams',
  feature3Desc:
    'Caster syncing, live statuses and Discord notifications so you never miss a match.',
  feature4Title: 'Automatic roles & permissions',
  feature4Desc:
    'Staff and player roles are synced with registered teams, with no manual management.',
  feature5Title: 'Dedicated public space',
  feature5Desc:
    'You get your own public space on the site (URL `/<your-slug>/...`) to announce your tournaments.',
  feature6Title: 'Self-hosted, no dependency',
  feature6Desc:
    'You stay in control: the secrets are handed to you only once, and you run the bot on your own infra.',
  ctaTitle: 'Ready to get started?',
  ctaDesc:
    'The request is free and takes less than two minutes. You then receive a confirmation email, followed by a button to invite the bot to your server.',
  requestBot: 'Request the bot',
  signedInAs: 'You are signed in as {name}.',
  discordUserFallback: 'Discord user',
  signInPrompt:
    'Sign in via Discord to get started — we need your Discord ID to link the bot to your server.',
  noPassword: 'No password to create. Your Discord account is enough.',
  questionPrefix: 'A question? Join the',
  communityDiscord: 'community Discord',
  questionMiddle: 'or email us at',
};
