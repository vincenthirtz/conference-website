// lib/i18n/locales/en/onboardCheckEmail.ts
//
// Traductions ANGLAISES du namespace `onboardCheckEmail`.
//
// La SOURCE DE VERITE est le francais (`../fr/onboardCheckEmail.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Email sent',
  step: 'Step 2/3 — Email confirmation',
  body: 'Click the link in the email we just sent to confirm your request. The link is valid for a single use.',
  spamNote:
    "Remember to check your spam folder if you don't see it after a few minutes.",
  unreachable: 'Missing or invalid request ID.',
  restart: 'Start the request again',
  polling:
    "We're watching for confirmation in the background — you'll be redirected automatically as soon as you click the link.",
  lostEmailTitle: 'Lost the email?',
  lostEmailBody:
    'Automatic resending is not available yet. To get a new link, contact staff on',
  ourDiscord: 'our Discord',
  backToIntro: '← Back to the presentation',
};
